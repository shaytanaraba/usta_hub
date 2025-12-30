# Supabase Setup Instructions for Plumber Hub

## 1. Create Supabase Project
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign up/log in.
2. Click **"New Project"**.
3. Enter a Name (e.g., `PlumberHub`) and Database Password (save this securely).
4. Choose a Region closest to your users (e.g., Singapore or Frankfurt, depending on Kyrgyzstan latency).
5. Click **"Create new project"**.

## 2. Get API Credentials
1. Once the project is created (takes ~2 mins), go to **Project Settings** (gear icon) -> **API**.
2. Copy the **Project URL** and **anon public key**.
3. You will need these for the app configuration.

## 2.5 Disable Email Confirmation (For Development)
1. Go to **Authentication** (icon on the left bar) -> **Providers** -> **Email**.
2. Uncheck **Enable Email Confirmations**.
3. Click **Save**.
   * *This allows users to login immediately after registration without verifying their email.*

## 3. Run Database Setup
1. In the Supabase Dashboard, go to the **SQL Editor** (icon on the left bar).
2. Click **"New Query"**.
3. Copy the entire content of the file `supabase_setup.sql` from this project.
4. Paste it into the SQL Editor.
5. Click **"Run"** (bottom right).
   - *Success Message*: "Success. No rows returned."

## 4. Install Dependencies
Run the following command in your terminal to install the Supabase client:
```bash
npm install @supabase/supabase-js
```

## 5. Configure App
Create a file `src/lib/supabase.js` with the following content (replace placeholders with your actual keys):

```javascript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```
