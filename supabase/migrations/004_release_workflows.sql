begin;
create table public.releases (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 name text not null check(length(name) between 1 and 120), version text not null check(length(version) between 1 and 80),
 status text not null default 'Planned' check(status in ('Planned','Testing','Released')),
 target_date date, notes text not null default '' check(length(notes)<=10000),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(project_id,version)
);
create index releases_project on public.releases(project_id,created_at desc);
create table public.issue_templates (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 name text not null check(length(name) between 1 and 120),
 type text not null default 'Bug' check(type in ('Bug','Improvement','Feature')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High','Critical')),
 severity text not null default 'Major' check(severity in ('Cosmetic','Minor','Major','Blocker')),
 description text not null default '' check(length(description)<=30000), steps text not null default '',
 expected text not null default '', actual text not null default '',
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),unique(project_id,name)
);
create index templates_project on public.issue_templates(project_id);
create table public.saved_views (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check(length(name) between 1 and 80),
 filters jsonb not null check(jsonb_typeof(filters)='object' and octet_length(filters::text)<=10000),
 created_at timestamptz not null default now(), unique(user_id,name)
);
create index saved_views_user on public.saved_views(user_id);
alter table public.issues add column severity text not null default 'Major' check(severity in ('Cosmetic','Minor','Major','Blocker'));
alter table public.issues add column release_id uuid references public.releases(id);
alter table public.issues add column due_date date;
create index issues_release on public.issues(release_id) where deleted_at is null;
create index issues_due_date on public.issues(due_date) where deleted_at is null and status<>'Closed';
alter table public.comments add column mention_ids uuid[] not null default '{}';
alter table public.attachments drop constraint attachments_mime_type_check;
alter table public.attachments drop constraint attachments_size_check;
alter table public.attachments add constraint attachments_media_type check(mime_type in ('image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'));
alter table public.attachments add constraint attachments_media_size check(size>0 and size<=case when mime_type like 'video/%' then 52428800 else 10485760 end);
-- Existing private bucket keeps all existing paths and policies.
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'] where id='issue-images';

alter table public.releases enable row level security;
alter table public.issue_templates enable row level security;
alter table public.saved_views enable row level security;
revoke all on public.releases,public.issue_templates,public.saved_views from anon,authenticated;
grant select,insert,update on public.releases to authenticated;
grant select,insert,update,delete on public.issue_templates to authenticated;
grant select,insert,update,delete on public.saved_views to authenticated;
create policy releases_read on public.releases for select to authenticated using(private.can_access(project_id));
create policy releases_create on public.releases for insert to authenticated with check(private.can_access(project_id) and private.current_role() in ('admin','developer') and created_by=auth.uid());
create policy releases_edit on public.releases for update to authenticated using(private.can_access(project_id) and private.current_role() in ('admin','developer')) with check(private.can_access(project_id) and private.current_role() in ('admin','developer'));
create policy templates_read on public.issue_templates for select to authenticated using(private.can_access(project_id));
create policy templates_create on public.issue_templates for insert to authenticated with check(private.can_access(project_id) and private.current_role() in ('admin','developer') and created_by=auth.uid());
create policy templates_edit on public.issue_templates for update to authenticated using(private.can_access(project_id) and private.current_role() in ('admin','developer')) with check(private.can_access(project_id) and private.current_role() in ('admin','developer'));
create policy templates_delete on public.issue_templates for delete to authenticated using(private.can_access(project_id) and private.current_role() in ('admin','developer'));
create policy views_read on public.saved_views for select to authenticated using(user_id=auth.uid() and private.current_role() is not null);
create policy views_create on public.saved_views for insert to authenticated with check(user_id=auth.uid() and private.current_role() is not null);
create policy views_edit on public.saved_views for update to authenticated using(user_id=auth.uid() and private.current_role() is not null) with check(user_id=auth.uid() and private.current_role() is not null);
create policy views_delete on public.saved_views for delete to authenticated using(user_id=auth.uid() and private.current_role() is not null);
create function private.guard_workflow_record() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.project_id<>old.project_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Record identity cannot be changed'; end if;
 return new;
end;
$$;
create trigger guard_release_identity before update on public.releases for each row execute function private.guard_workflow_record();
create trigger guard_template_identity before update on public.issue_templates for each row execute function private.guard_workflow_record();
create function private.guard_issue_release() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.release_id is not null and not exists(select 1 from public.releases where id=new.release_id and project_id=new.project_id) then raise exception 'Release must belong to the same project as the issue'; end if;
 return new;
end;
$$;
create trigger guard_issue_release before insert or update on public.issues for each row execute function private.guard_issue_release();
create function private.guard_comment_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid; target uuid;
begin
 select project_id into pid from public.issues where id=new.issue_id and deleted_at is null;
 if pid is null then raise exception 'Issue is unavailable'; end if;
 if cardinality(new.mention_ids)>20 then raise exception 'Mention no more than 20 teammates in a comment'; end if;
 for target in select distinct unnest(new.mention_ids) loop
  if not exists(select 1 from public.profiles p where p.id=target and p.active and (p.role='admin' or exists(select 1 from public.project_members m where m.user_id=p.id and m.project_id=pid))) then raise exception 'Mentioned teammate must have access to this project'; end if;
 end loop;
 return new;
end;
$$;
create trigger guard_comment_mentions before insert on public.comments for each row execute function private.guard_comment_mentions();
create or replace function private.record_comment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.issues;
begin
 select * into i from public.issues where id=new.issue_id;
 insert into public.activity(project_id,issue_id,actor_id,message) values(i.project_id,i.id,new.created_by,'added a comment');
 insert into public.notifications(user_id,project_id,issue_id,message)
 select p.id,i.project_id,i.id,case when p.id=any(new.mention_ids) then 'You were mentioned on ' else 'New comment on ' end||i.summary
 from public.profiles p where p.active and p.id<>new.created_by
 and (p.role='admin' or p.id=i.assignee_id or p.id=i.created_by or p.id=any(new.mention_ids))
 and (p.role='admin' or exists(select 1 from public.project_members where user_id=p.id and project_id=i.project_id));
 return new;
end;
$$;
-- Security invoker: all original row-level policies and per-row triggers remain in force.
create function public.bulk_update_issues(issue_ids uuid[],patch jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare target_ids uuid[]; visible_count integer:=0; row_id uuid; changed integer;
begin
 if private.current_role() not in ('admin','developer') or private.current_role() is null then raise exception 'Only administrators and project developers can use bulk actions'; end if;
 select array_agg(distinct x) into target_ids from unnest(issue_ids) x where x is not null;
 if coalesce(cardinality(target_ids),0) not between 1 and 100 then raise exception 'Select between 1 and 100 issues'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb or exists(select 1 from jsonb_object_keys(patch) k where k not in ('status','priority','severity','assignee_id','release_id','due_date','deleted_at')) then raise exception 'Invalid bulk changes'; end if;
 if patch?'deleted_at' and (select count(*) from jsonb_object_keys(patch))<>1 then raise exception 'Move to trash separately from other changes'; end if;
 for row_id in select id from public.issues where id=any(target_ids) and deleted_at is null order by id for update loop visible_count:=visible_count+1; end loop;
 if visible_count<>cardinality(target_ids) then raise exception 'One or more issues are unavailable or outside your project access'; end if;
 update public.issues set
 status=case when patch?'status' then patch->>'status' else status end,
 priority=case when patch?'priority' then patch->>'priority' else priority end,
 severity=case when patch?'severity' then patch->>'severity' else severity end,
 assignee_id=case when patch?'assignee_id' then (patch->>'assignee_id')::uuid else assignee_id end,
 release_id=case when patch?'release_id' then (patch->>'release_id')::uuid else release_id end,
 due_date=case when patch?'due_date' then (patch->>'due_date')::date else due_date end,
 deleted_at=case when patch?'deleted_at' then (patch->>'deleted_at')::timestamptz else deleted_at end
 where id=any(target_ids);
 get diagnostics changed=row_count;return changed;
end;
$$;
revoke all on function public.bulk_update_issues(uuid[],jsonb) from public,anon;
grant execute on function public.bulk_update_issues(uuid[],jsonb) to authenticated;
revoke all on function private.guard_workflow_record(),private.guard_issue_release(),private.guard_comment_mentions() from public,anon,authenticated;
commit;
