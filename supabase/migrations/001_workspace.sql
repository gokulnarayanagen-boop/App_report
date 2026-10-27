begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(full_name) between 1 and 120),
 email text not null,
 role text not null default 'tester' check(role in ('admin','developer','tester')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 120),
 prefix text not null unique check(prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
 description text not null default '',
 color text not null default '#7860dc' check(color ~ '^#[a-fA-F0-9]{6}$'),
 archived boolean not null default false,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.project_members (
 project_id uuid references public.projects(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 primary key(project_id,user_id)
);
create index project_members_user on public.project_members(user_id,project_id);
create table public.issues (
 id uuid primary key default gen_random_uuid(),
 issue_no bigint generated always as identity unique,
 project_id uuid not null references public.projects(id),
 summary text not null check(length(summary) between 3 and 200),
 description text not null default '' check(length(description)<=30000),
 type text not null default 'Bug' check(type in ('Bug','Improvement','Feature')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High','Critical')),
 status text not null default 'Open' check(status in ('Open','In progress','Ready for testing','Closed')),
 steps text not null default '', expected text not null default '', actual text not null default '',
 app_version text not null default '', device text not null default '',
 assignee_id uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 duplicate_of uuid references public.issues(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index issues_project on public.issues(project_id,created_at desc);
create index issues_assignee on public.issues(assignee_id);
create table public.comments (
 id uuid primary key default gen_random_uuid(),
 issue_id uuid not null references public.issues(id) on delete cascade,
 body text not null check(length(body) between 1 and 10000),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index comments_issue on public.comments(issue_id,created_at);
create table public.attachments (
 id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.issues(id) on delete cascade,
 path text not null unique, name text not null, mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
 size integer not null check(size>0 and size<=10485760),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index attachments_issue on public.attachments(issue_id);
create table public.activity (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 issue_id uuid references public.issues(id) on delete cascade,
 actor_id uuid references public.profiles(id), message text not null,
 created_at timestamptz not null default now()
);
create index activity_project on public.activity(project_id,created_at desc);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 issue_id uuid references public.issues(id) on delete cascade,
 message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id,created_at desc);

create function private.current_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active;
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='admin',false);
$$;
create function private.can_access(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and (private.is_admin() or exists(select 1 from public.project_members where project_id=pid and user_id=auth.uid()));
$$;
create function private.can_issue(iid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.issues where id=iid and private.can_access(project_id));
$$;
create function private.visible_profile(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and (uid=auth.uid() or private.is_admin() or exists(
 select 1 from public.project_members a join public.project_members b on a.project_id=b.project_id where a.user_id=auth.uid() and b.user_id=uid)
 or exists(select 1 from public.profiles where id=uid and role='admin'));
$$;
create function private.storage_issue(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.issues where project_id::text=split_part(object_name,'/',1) and id::text=split_part(object_name,'/',2) and private.can_access(project_id));
$$;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,email) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1),'User'),120),coalesce(new.email,''));
 return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();
-- Backfill accounts created before this migration. No user is promoted automatically.
insert into public.profiles(id,full_name,email)
select id,left(coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1),'User'),120),coalesce(email,'') from auth.users on conflict(id) do nothing;

create function private.guard_issue() returns trigger language plpgsql security definer set search_path='' as $$
declare role_name text := private.current_role();
begin
 if not private.can_access(new.project_id) then raise exception 'Project access denied'; end if;
 if tg_op='INSERT' then
  if new.created_by<>auth.uid() or new.status<>'Open' then raise exception 'Invalid reporter or initial status'; end if;
  if exists(select 1 from public.projects where id=new.project_id and archived) then raise exception 'This project is archived'; end if;
  if role_name='tester' and new.assignee_id is not null then raise exception 'Only developers can assign issues'; end if;
  new.created_at:=now();
 else
  if new.id<>old.id or new.project_id<>old.project_id or new.created_by<>old.created_by or new.issue_no<>old.issue_no or new.created_at<>old.created_at then raise exception 'Issue identity cannot be changed'; end if;
  if role_name='tester' then
   if new.assignee_id is distinct from old.assignee_id or new.duplicate_of is distinct from old.duplicate_of then raise exception 'Only developers can assign or link issues'; end if;
   if old.created_by<>auth.uid() and (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) then raise exception 'You can only edit reports you created'; end if;
   if new.status<>old.status and not(old.status='Ready for testing' and new.status in ('Open','Closed') or old.status='Closed' and new.status='Open') then raise exception 'Testers can verify a fix or reopen an issue'; end if;
  end if;
 end if;
 if new.assignee_id is not null and (tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id) and not exists(select 1 from public.profiles p where p.id=new.assignee_id and p.active and (p.role='admin' or p.role='developer' and exists(select 1 from public.project_members m where m.user_id=p.id and m.project_id=new.project_id))) then raise exception 'Assignee must be an active project developer'; end if;
 if new.duplicate_of is not null and (new.duplicate_of=new.id or not exists(select 1 from public.issues where id=new.duplicate_of and project_id=new.project_id)) then raise exception 'Duplicate must be a different issue in the same project'; end if;
 new.updated_at:=now(); return new;
end;
$$;
create trigger guard_issue before insert or update on public.issues for each row execute function private.guard_issue();
create function private.record_issue_event() returns trigger language plpgsql security definer set search_path='' as $$
declare msg text;
begin
 if tg_op='INSERT' then msg:='created this issue';
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
create trigger record_issue_event after insert or update on public.issues for each row execute function private.record_issue_event();
create function private.record_comment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.issues;
begin
 select * into i from public.issues where id=new.issue_id;
 insert into public.activity(project_id,issue_id,actor_id,message) values(i.project_id,i.id,new.created_by,'added a comment');
 insert into public.notifications(user_id,project_id,issue_id,message)
 select p.id,i.project_id,i.id,'New comment on '||i.summary from public.profiles p where p.active and p.id<>new.created_by and (p.role='admin' or p.id=i.assignee_id or p.id=i.created_by)
 and (p.role='admin' or exists(select 1 from public.project_members where user_id=p.id and project_id=i.project_id));
 return new;
end;
$$;
create trigger record_comment_event after insert on public.comments for each row execute function private.record_comment_event();
-- Prevent notification recipients from changing the recipient, project, message, or issue.
create function private.guard_notification() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'read_at') is distinct from (to_jsonb(old)-'read_at') then raise exception 'Only read status can be changed'; end if;
 return new;
end;
$$;
create trigger guard_notification before update on public.notifications for each row execute function private.guard_notification();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.issues enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;
revoke all on public.profiles,public.projects,public.project_members,public.issues,public.comments,public.attachments,public.activity,public.notifications from anon,authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update on public.projects,public.issues to authenticated;
grant select,insert,delete on public.project_members,public.attachments to authenticated;
grant select,insert on public.comments to authenticated;
grant select on public.activity to authenticated;
grant select,update on public.notifications to authenticated;
grant usage,select on sequence public.issues_issue_no_seq to authenticated;
create policy profile_read on public.profiles for select to authenticated using(private.visible_profile(id));
create policy project_read on public.projects for select to authenticated using(private.can_access(id));
create policy project_create on public.projects for insert to authenticated with check(private.is_admin() and created_by=auth.uid());
create policy project_edit on public.projects for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy member_read on public.project_members for select to authenticated using(private.can_access(project_id));
create policy member_add on public.project_members for insert to authenticated with check(private.is_admin());
create policy member_remove on public.project_members for delete to authenticated using(private.is_admin());
create policy issue_read on public.issues for select to authenticated using(private.can_access(project_id));
create policy issue_create on public.issues for insert to authenticated with check(private.can_access(project_id) and created_by=auth.uid());
create policy issue_edit on public.issues for update to authenticated using(private.can_access(project_id)) with check(private.can_access(project_id));
create policy comment_read on public.comments for select to authenticated using(private.can_issue(issue_id));
create policy comment_create on public.comments for insert to authenticated with check(private.can_issue(issue_id) and created_by=auth.uid());
create policy attachment_read on public.attachments for select to authenticated using(private.can_issue(issue_id));
create policy attachment_create on public.attachments for insert to authenticated with check(private.can_issue(issue_id) and created_by=auth.uid() and private.storage_issue(path) and split_part(path,'/',2)=issue_id::text);
create policy attachment_remove on public.attachments for delete to authenticated using(private.can_issue(issue_id) and (created_by=auth.uid() or private.current_role() in ('admin','developer')));
create policy activity_read on public.activity for select to authenticated using(private.can_access(project_id));
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid() and private.can_access(project_id));
create policy notification_edit on public.notifications for update to authenticated using(user_id=auth.uid() and private.can_access(project_id)) with check(user_id=auth.uid() and private.can_access(project_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('issue-images','issue-images',false,10485760,array['image/png','image/jpeg','image/webp','image/gif']) on conflict(id) do nothing;
create policy issue_image_read on storage.objects for select to authenticated using(bucket_id='issue-images' and private.storage_issue(name));
create policy issue_image_upload on storage.objects for insert to authenticated with check(bucket_id='issue-images' and private.storage_issue(name));
create policy issue_image_delete on storage.objects for delete to authenticated using(bucket_id='issue-images' and private.storage_issue(name) and (owner_id=auth.uid()::text or private.current_role() in ('admin','developer')));
-- Trigger functions are callable only through their triggers.
revoke all on function private.new_profile(),private.guard_issue(),private.record_issue_event(),private.record_comment_event(),private.guard_notification() from public,anon,authenticated;
commit;
