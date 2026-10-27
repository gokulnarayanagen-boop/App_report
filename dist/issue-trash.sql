begin;
alter table public.issues add column deleted_at timestamptz;
create index issues_active_project on public.issues(project_id,updated_at desc) where deleted_at is null;
create function private.guard_issue_trash() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.deleted_at is not null then raise exception 'New reports cannot start in trash'; end if;
  return new;
 end if;
 if new.deleted_at is distinct from old.deleted_at then
  if private.current_role() not in ('admin','developer') then raise exception 'Only administrators and project developers can move or restore issues'; end if;
  if (to_jsonb(new)-array['deleted_at','updated_at']) is distinct from (to_jsonb(old)-array['deleted_at','updated_at']) then raise exception 'Move or restore the issue separately from other edits'; end if;
  if new.deleted_at is not null then new.deleted_at:=now(); end if;
 elsif old.deleted_at is not null then raise exception 'Restore this issue before editing it';
 end if;
 return new;
end;
$$;
create trigger guard_issue_trash before insert or update on public.issues for each row execute function private.guard_issue_trash();
revoke all on function private.guard_issue_trash() from public,anon,authenticated;
drop policy issue_read on public.issues;
create policy issue_read on public.issues for select to authenticated using(private.can_access(project_id) and (deleted_at is null or private.current_role() in ('admin','developer')));
create or replace function private.can_issue(iid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.issues where id=iid and deleted_at is null and private.can_access(project_id));
$$;
create or replace function private.storage_issue(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.issues where deleted_at is null and project_id::text=split_part(object_name,'/',1) and id::text=split_part(object_name,'/',2) and private.can_access(project_id));
$$;
create or replace function private.record_issue_event() returns trigger language plpgsql security definer set search_path='' as $$
declare msg text;
begin
 if tg_op='INSERT' then msg:='created this issue';
 elsif new.deleted_at is distinct from old.deleted_at then msg:=case when new.deleted_at is null then 'restored this issue' else 'moved this issue to trash' end;
 elsif new.status<>old.status then msg:='changed status to '||new.status;
 elsif new.assignee_id is distinct from old.assignee_id then msg:='changed the assignee';
 elsif new.duplicate_of is distinct from old.duplicate_of then msg:='updated the duplicate link';
 else msg:='updated this issue'; end if;
 insert into public.activity(project_id,issue_id,actor_id,message) values(new.project_id,new.id,auth.uid(),msg);
 insert into public.notifications(user_id,project_id,issue_id,message)
 select p.id,new.project_id,new.id,new.summary||' — '||msg from public.profiles p
 where p.active and p.id<>auth.uid() and (p.role='admin' or p.id=new.assignee_id or p.id=new.created_by)
 and (p.role='admin' or exists(select 1 from public.project_members where user_id=p.id and project_id=new.project_id));
 return new;
end;
$$;
commit;
