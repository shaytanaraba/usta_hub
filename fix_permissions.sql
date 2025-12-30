-- RUN THIS IN SUPABASE SQL EDITOR TO FIX ADMIN PERMISSIONS
-- This allows admin users to update verify status of plumbers

drop policy if exists "Admins can update any profile" on profiles;

create policy "Admins can update any profile"
  on profiles for update
  using ( 
    exists (select 1 from profiles where id = auth.uid() and user_type = 'admin') 
  );

-- Also ensure Admins can DELETE/INSERT if needed (optional but good for management)
drop policy if exists "Admins can delete any profile" on profiles;
create policy "Admins can delete any profile"
  on profiles for delete
  using ( 
    exists (select 1 from profiles where id = auth.uid() and user_type = 'admin') 
  );
