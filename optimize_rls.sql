-- SUPABASE PERFORMANCE & SECURITY OPTIMIZATION
-- This script resolves lints regarding RLS initialization and multiple permissive policies.

-- 1. OPTIMIZE PROFILES
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

CREATE POLICY "Profiles SELECT" 
  ON profiles FOR SELECT 
  TO authenticated, anon
  USING ( true );

CREATE POLICY "Profiles UPDATE" 
  ON profiles FOR UPDATE 
  TO authenticated
  USING ( 
    (select auth.uid()) = id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin')
  );
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. OPTIMIZE ORDERS
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients can view their own orders" ON orders;
DROP POLICY IF EXISTS "Plumbers can view available or assigned orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all data" ON orders;
DROP POLICY IF EXISTS "Clients can create orders" ON orders;
DROP POLICY IF EXISTS "Clients can update their own orders" ON orders;
DROP POLICY IF EXISTS "Plumbers can update assigned orders or claim pending" ON orders;
DROP POLICY IF EXISTS "Admins can update all data" ON orders;

CREATE POLICY "Orders SELECT" 
  ON orders FOR SELECT 
  TO authenticated
  USING (
    client_id = (select auth.uid()) OR 
    (status = 'pending') OR 
    (plumber_id = (select auth.uid())) OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin')
  );

CREATE POLICY "Orders INSERT" 
  ON orders FOR INSERT 
  TO authenticated
  WITH CHECK ( client_id = (select auth.uid()) );

CREATE POLICY "Orders UPDATE" 
  ON orders FOR UPDATE 
  TO authenticated
  USING (
    client_id = (select auth.uid()) OR 
    (status = 'pending' AND EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'plumber' AND is_verified = true)) OR 
    (plumber_id = (select auth.uid())) OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin')
  );
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 3. OPTIMIZE REVIEWS
ALTER TABLE public.reviews DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON reviews;
DROP POLICY IF EXISTS "Clients can create reviews" ON reviews;

CREATE POLICY "Reviews SELECT" 
  ON reviews FOR SELECT 
  TO authenticated, anon
  USING ( true );

CREATE POLICY "Reviews INSERT" 
  ON reviews FOR INSERT 
  TO authenticated
  WITH CHECK ( (select auth.uid()) = client_id );
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 4. OPTIMIZE DISPUTES
ALTER TABLE public.disputes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients can view their own disputes" ON disputes;
DROP POLICY IF EXISTS "Plumbers can view their disputes" ON disputes;
DROP POLICY IF EXISTS "Admins can view all disputes" ON disputes;
DROP POLICY IF EXISTS "Clients can create disputes" ON disputes;
DROP POLICY IF EXISTS "Admins can update disputes" ON disputes;
DROP POLICY IF EXISTS "Clients can close resolved disputes" ON disputes;

CREATE POLICY "Disputes SELECT" 
  ON disputes FOR SELECT 
  TO authenticated
  USING (
    (select auth.uid()) = client_id OR 
    (select auth.uid()) = plumber_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin')
  );

CREATE POLICY "Disputes INSERT" 
  ON disputes FOR INSERT 
  TO authenticated
  WITH CHECK ( (select auth.uid()) = client_id );

CREATE POLICY "Disputes UPDATE" 
  ON disputes FOR UPDATE 
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin') OR 
    ((select auth.uid()) = client_id AND status = 'resolved')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin') OR 
    (status = 'closed')
  );
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- 5. OPTIMIZE PLATFORM SETTINGS
ALTER TABLE public.platform_settings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Settings viewable by everyone" ON platform_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON platform_settings;

CREATE POLICY "Settings SELECT" 
  ON platform_settings FOR SELECT 
  TO authenticated
  USING ( true );

CREATE POLICY "Settings UPDATE" 
  ON platform_settings FOR UPDATE 
  TO authenticated
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND user_type = 'admin') );
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
