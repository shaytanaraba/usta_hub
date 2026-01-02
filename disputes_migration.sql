-- Disputes Table Migration
-- Run this after supabase_setup.sql

-- 1. Add is_disputed flag to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_disputed BOOLEAN DEFAULT FALSE;

-- 2. Create disputes table for compliance tracking
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.profiles(id) NOT NULL,
  plumber_id UUID REFERENCES public.profiles(id) NOT NULL,
  
  -- Dispute details
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
  
  -- Admin resolution
  admin_notes TEXT,
  resolved_by UUID REFERENCES public.profiles(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 3. Enable Row Level Security
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Disputes

-- Clients can view their own disputes
DROP POLICY IF EXISTS "Clients can view their own disputes" ON disputes;
CREATE POLICY "Clients can view their own disputes"
  ON disputes FOR SELECT
  USING ( auth.uid() = client_id );

-- Clients can create disputes for their orders
DROP POLICY IF EXISTS "Clients can create disputes" ON disputes;
CREATE POLICY "Clients can create disputes"
  ON disputes FOR INSERT
  WITH CHECK ( auth.uid() = client_id );

-- Plumbers can view disputes on their orders
DROP POLICY IF EXISTS "Plumbers can view their disputes" ON disputes;
CREATE POLICY "Plumbers can view their disputes"
  ON disputes FOR SELECT
  USING ( auth.uid() = plumber_id );

-- Admins can view all disputes
DROP POLICY IF EXISTS "Admins can view all disputes" ON disputes;
CREATE POLICY "Admins can view all disputes"
  ON disputes FOR SELECT
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') );

-- Admins can update disputes (add notes, resolve, close)
DROP POLICY IF EXISTS "Admins can update disputes" ON disputes;
CREATE POLICY "Admins can update disputes"
  ON disputes FOR UPDATE
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'admin') );

-- Clients can update their own disputes (only to close if resolved)
DROP POLICY IF EXISTS "Clients can close resolved disputes" ON disputes;
CREATE POLICY "Clients can close resolved disputes"
  ON disputes FOR UPDATE
  USING ( auth.uid() = client_id AND status = 'resolved' )
  WITH CHECK ( status = 'closed' );

-- 5. Trigger for updating disputes.updated_at
CREATE TRIGGER update_disputes_modtime
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 6. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_client_id ON disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_plumber_id ON disputes(plumber_id);

-- 7. Add comment for documentation
COMMENT ON TABLE disputes IS 'Tracks payment disputes and compliance cases for order resolution';
