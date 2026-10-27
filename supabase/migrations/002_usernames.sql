begin;
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format check(username is null or username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$');
create unique index profiles_username_unique on public.profiles(username) where username is not null;
-- Existing accounts retain email login until an administrator assigns a username.
create table private.username_login_limits (
 username text primary key, window_start timestamptz not null, attempts integer not null
);
revoke all on private.username_login_limits from public,anon,authenticated;
create function public.consume_username_login(login_name text) returns boolean
language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
 if login_name !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' then return false; end if;
 delete from private.username_login_limits where window_start < now()-interval '1 day';
 insert into private.username_login_limits as limits(username,window_start,attempts)
 values(login_name,now(),1)
 on conflict(username) do update set
 attempts=case when limits.window_start < now()-interval '15 minutes' then 1 else limits.attempts+1 end,
 window_start=case when limits.window_start < now()-interval '15 minutes' then now() else limits.window_start end
 returning attempts into count_now;
 return count_now<=10;
end;
$$;
revoke all on function public.consume_username_login(text) from public,anon,authenticated;
grant execute on function public.consume_username_login(text) to service_role;
commit;
