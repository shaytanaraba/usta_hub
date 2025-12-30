-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  user_type text not null check (user_type in ('client', 'plumber', 'admin')),
  full_name text,
  phone text,
  
  -- Plumber Specific Fields
  is_verified boolean default false,
  license_number text,
  service_area text,
  experience text,
  specializations text[], -- Array of strings
  rating numeric default 0,
  completed_jobs integer default 0,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Turn on Row Level Security
alter table public.profiles enable row level security;

-- Policies for Profiles
drop policy if exists "Public profiles are viewable by everyone" on profiles;
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using ( auth.uid() = id );

drop policy if exists "Admins can update any profile" on profiles;
create policy "Admins can update any profile"
  on profiles for update
  using ( exists (select 1 from profiles where id = auth.uid() and user_type = 'admin') );

-- 2. ORDERS TABLE
create table if not exists public.orders (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references public.profiles(id) not null,
  
  -- Service Details
  service_type text not null,
  problem_description text not null,
  address text not null,
  urgency text default 'normal',
  preferred_date text,
  preferred_time text,
  photos text[], -- Array of image URLs
  
  -- Status Lifecycle
  status text default 'pending' check (status in ('pending', 'claimed', 'in_progress', 'completed', 'verified', 'cancelled')),
  
  -- Assignment
  plumber_id uuid references public.profiles(id),
  assigned_at timestamptz,
  
  -- Completion Details
  final_price numeric,
  payment_method text check (payment_method in ('cash', 'transfer', 'card_future')),
  work_description text,
  hours_worked numeric,
  completed_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Turn on Row Level Security
alter table public.orders enable row level security;

-- Policies for Orders

-- CLIENTS: Can see their own orders
drop policy if exists "Clients can view their own orders" on orders;
create policy "Clients can view their own orders"
  on orders for select
  using ( auth.uid() = client_id );

-- CLIENTS: Can create orders
drop policy if exists "Clients can create orders" on orders;
create policy "Clients can create orders"
  on orders for insert
  with check ( auth.uid() = client_id );

-- CLIENTS: Can update their own orders (e.g. to verify/rate)
drop policy if exists "Clients can update their own orders" on orders;
create policy "Clients can update their own orders"
  on orders for update
  using ( auth.uid() = client_id );

-- PLUMBERS: Can view 'pending' orders OR orders assigned to them
drop policy if exists "Plumbers can view available or assigned orders" on orders;
create policy "Plumbers can view available or assigned orders"
  on orders for select
  using ( 
    (status = 'pending') OR 
    (plumber_id = auth.uid()) OR
    (exists (select 1 from profiles where id = auth.uid() and user_type = 'admin'))
  );

-- PLUMBERS: Can update orders (Claim, Start, Complete)
drop policy if exists "Plumbers can update assigned orders or claim pending" on orders;
create policy "Plumbers can update assigned orders or claim pending"
  on orders for update
  using ( 
    -- Who can perform the update?
    (status = 'pending' AND exists (select 1 from profiles where id = auth.uid() and user_type = 'plumber' and is_verified = true)) OR
    (plumber_id = auth.uid()) OR
    (exists (select 1 from profiles where id = auth.uid() and user_type = 'admin'))
  )
  with check (
    -- What can the resulting row look like?
    (plumber_id = auth.uid()) OR
    (exists (select 1 from profiles where id = auth.uid() and user_type = 'admin'))
  );

-- ADMINS: Can view all orders
drop policy if exists "Admins can view all data" on orders;
create policy "Admins can view all data"
  on orders for select
  using ( 
    exists (select 1 from profiles where id = auth.uid() and user_type = 'admin')
  );

drop policy if exists "Admins can update all data" on orders;
create policy "Admins can update all data"
  on orders for update
  using ( 
    exists (select 1 from profiles where id = auth.uid() and user_type = 'admin')
  );

-- 3. REVIEWS TABLE
create table if not exists public.reviews (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) not null,
  plumber_id uuid references public.profiles(id) not null,
  client_id uuid references public.profiles(id) not null,
  
  rating integer check (rating >= 1 and rating <= 5),
  comment text,
  
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

drop policy if exists "Reviews are viewable by everyone" on reviews;
create policy "Reviews are viewable by everyone"
  on reviews for select
  using ( true );

drop policy if exists "Clients can create reviews" on reviews;
create policy "Clients can create reviews"
  on reviews for insert
  with check ( auth.uid() = client_id );


-- 4. FUNCTIONS & TRIGGERS

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, user_type, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'userType', 'client'),
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user creation
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger for Updating 'updated_at' timestamp
create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new; 
end;
$$ language plpgsql;


create trigger update_orders_modtime
    before update on orders
    for each row execute procedure update_modified_column();

-- 5. PLATFORM SETTINGS
create table if not exists public.platform_settings (
  id serial primary key,
  commission_rate numeric default 0.15,
  support_email text,
  support_phone text,
  bank_details jsonb, -- { bankName, accountName, accountNumber, routingNumber }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.platform_settings enable row level security;

-- Only Admin can modify, everyone can view (or just auth users)
drop policy if exists "Settings viewable by everyone" on platform_settings;
create policy "Settings viewable by everyone"
  on platform_settings for select
  using ( true );

drop policy if exists "Admins can update settings" on platform_settings;
create policy "Admins can update settings"
  on platform_settings for update
  using ( exists (select 1 from profiles where id = auth.uid() and user_type = 'admin') );

-- Insert default settings if empty
insert into public.platform_settings (commission_rate, support_email, support_phone)
select 0.15, 'support@plumberhub.com', '+1-800-PLUMBER'
where not exists (select 1 from platform_settings);

