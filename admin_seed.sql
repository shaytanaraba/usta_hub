-- Admin Seed Script for PlumberHub
-- Run this ONCE in your Supabase SQL Editor to create the first admin account

-- STEP 1: First, create an admin user in Supabase Dashboard
-- Go to Authentication -> Users -> Add User
-- Email: admin@plumberhub.com
-- Password: (choose a secure password)
-- Copy the UUID that gets generated

-- STEP 2: Replace 'YOUR_ADMIN_UUID_HERE' below with the actual UUID from step 1
-- Then run this script

DO $$
DECLARE
  admin_uuid uuid := 'YOUR_ADMIN_UUID_HERE'; -- REPLACE THIS!
BEGIN
  -- Update the profile to be admin type
  UPDATE profiles
  SET user_type = 'admin',
      full_name = 'System Administrator',
      phone = '+996700000000'
  WHERE id = admin_uuid;
  
  RAISE NOTICE 'Admin account created successfully!';
  RAISE NOTICE 'Email: admin@plumberhub.com';
  RAISE NOTICE 'You can now login with this account.';
END $$;

-- Verify the admin was created
SELECT id, email, user_type, full_name 
FROM profiles 
WHERE user_type = 'admin';
