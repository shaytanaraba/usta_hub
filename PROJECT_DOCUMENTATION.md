# PlumberHub Project Documentation

## 1. Project Overview
**PlumberHub** is a cross-platform mobile application (React Native/Expo) that serves as a gig-economy marketplace connecting clients with plumbers. It features a robust administrative backend for managing users, disputes, and platform settings. The backend is powered by **Supabase** (PostgreSQL + Auth).

---

## 2. Architecture & Tech Stack
- **Frontend**: React Native (Expo SDK 50+).
- **Backend / Database**: Supabase (PostgreSQL).
- **Auth**: Supabase Auth (Email/Password).
- **State Management**: React Context (`ToastContext`) + Local State.
- **Navigation**: React Navigation (Native Stack).
- **Styling**: `StyleSheet` + `expo-linear-gradient`.

---

## 3. Database Schema (Detailed)

### 3.1 `public.profiles`
Extends Supabase `auth.users`. Automatically created via Trigger `on_auth_user_created`.
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK, FK -> `auth.users` | Matches Auth User ID. |
| `email` | Text | Not Null | Synced from Auth. |
| `user_type` | Text | Enum('client', 'plumber', 'admin') | defined at registration. |
| `full_name` | Text | | |
| `phone` | Text | | Normalized format (e.g. +996...). |
| **Plumber Specific** | | | |
| `is_verified` | Boolean | Default `false` | **Gatekeeper**. Must be true to claim jobs. |
| `license_number` | Text | | Optional. |
| `service_area` | Text | | Required for verification. |
| `experience` | Text | | Years of experience. |
| `specializations` | Text[] | | Array of strings (e.g. 'residential', 'repair'). |
| `rating` | Numeric | Default 0 | Avg rating. |
| `completed_jobs` | Integer | Default 0 | Count of verified orders. |

### 3.2 `public.orders`
The central transaction table.
| Column | Type | Key Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK | |
| `client_id` | UUID | FK -> `profiles`| Creator of the order. |
| `plumber_id` | UUID | FK -> `profiles`| Assigned plumber (Nullable). |
| `status` | Text | Enum | `pending`, `claimed`, `in_progress`, `completed`, `verified`, `cancelled` |
| `service_type` | Text | | 'repair', 'installation', 'inspection'. |
| `problem_description`| Text | | |
| `address` | Text | | |
| `urgency` | Text | | 'planned', 'urgent', 'emergency'. |
| `preferred_date` | Text | | YYYY-MM-DD (if planned). |
| `preferred_time` | Text | | HH:MM. |
| `photos` | Text[] | | Array of image URLs/URIs. |
| `final_price` | Numeric | | Entered by Plumber upon completion. |
| `hours_worked` | Numeric | | Entered by Plumber upon completion. |
| `work_description` | Text | | Entered by Plumber upon completion. |
| `payment_method` | Text | | 'cash', 'transfer'. Selected by Client at verification. |
| `is_disputed` | Boolean | Default `false` | Flag for dispute system. |

### 3.3 `public.reviews`
| Column | Type | Description |
| :--- | :--- | :--- |
| `order_id` | UUID | FK -> `orders`. Unique per order. |
| `client_id` | UUID | FK -> `profiles`. |
| `plumber_id` | UUID | FK -> `profiles`. |
| `rating` | Integer | 1-5. |
| `comment` | Text | |

### 3.4 `public.disputes`
| Column | Type | Description |
| :--- | :--- | :--- |
| `order_id` | UUID | FK -> `orders`. |
| `client_id` | UUID | Initiator. |
| `plumber_id` | UUID | Respondent. |
| `status` | Text | `open`, `in_review`, `resolved`, `closed`. |
| `reason` | Text | Client's complaint. |
| `admin_notes` | Text | Internal admin log. |
| `resolved_by` | UUID | FK -> Admin ID. |

### 3.5 `public.platform_settings`
Singleton table for global config.
| Column | Type | Description |
| :--- | :--- | :--- |
| `commission_rate` | Numeric | Default 0.15 (15%). |
| `support_email` | Text | |
| `support_phone` | Text | |
| `bank_details` | JSONB | Admin bank info for transfers. |

---

## 4. Service Layer Architecture

### 4.1 `AuthService` (`src/services/auth.js`)
- **Key Methods**:
    - `registerUser(userData)`: Handles Supabase Auth SignUp. Passes `userType` in metadata to trigger profile creation.
    - `loginUser(email, pass)`: Signs in, fetches Profile, prevents login if `user_type` mismatch.
    - `updateProfile(id, updates)`: Updates `profiles` table. Handles partial updates.
    - `verifyPlumber(id)` / `unverifyPlumber(id)`: Admin-only toggles.

### 4.2 `OrdersService` (`src/services/orders.js`)
- **Key Logic**:
    - **Optimistic Locking**: `claimOrder` uses a specific SQL `WHERE` clause (`status='pending' AND plumber_id IS NULL`) to prevent race conditions where two plumbers claim the same job simultaneously.
    - **Guest Order Creation**: `createAdminOrder` allows admins to create orders for phone-in clients. It auto-creates a "Guest" account (email `guest@plumberhub.com`) if the phone number doesn't match an existing client.
    - **Job Limits**: Plumber cannot claim if they have > 2 active jobs.

### 4.3 `SettingsService` (`src/services/settings.js`)
- Fetches/Updates the single row in `platform_settings`. Defaults to 15% commission if table is empty.

---

## 5. Critical User Flows

### 5.1 Plumber Verification
1.  **Registration**: User signs up as 'Plumber'.
    - `is_verified` defaults to `false`.
    - Can login, but cannot see "Claim" buttons or detailed order info.
2.  **Profile Completion**: Plumber goes to `PlumberProfileSettings`.
    - Must fill: `Service Area`, `Experience`, `Specializations`.
3.  **Review**: Plumber sees "Admins notified" banner.
4.  **Approval**: Admin checks `Plumbers Tab`, sees profile details, clicks **"Verify"**.
5.  **Access**: Plumber dashboard updates to "Verified", Claim buttons unlock.

### 5.2 The Order Lifecycle (State Machine)
1.  **PENDING**: Created by Client. Visible in "Available" tab for Plumbers.
2.  **CLAIMED**: Plumber clicks "Claim". `plumber_id` assigned. Removed from "Available". Appears in Plumber's "My Jobs".
3.  **IN_PROGRESS**: Plumber clicks "Start Job".
4.  **COMPLETED**: Plumber finishes work. Opens modal, enters `final_price` and `work_description`. Scope locked.
5.  **VERIFIED (Terminal)**: Client reviews the price/work. Clicks "Confirm & Pay".
    - Transaction recorded in Plumber stats.

### 5.3 Dispute Resolution
1.  **Trigger**: Custom logic allows Dispute only on `completed` orders (before verification).
2.  **Action**: Client clicks "Dispute", enters reason.
3.  **Effect**: `orders.is_disputed` = `true`. Order appears in Admin `Compliance Tab`.
4.  **Resolution**: Admin investigates (offline). Admin marks dispute `resolved`.
5.  **Closure**: Client or Admin marks `closed`. `orders.is_disputed` reset to `false`.

---

## 6. UI Structure & Screens

### 6.1 Admin Dashboard (`AdminDashboard.js`)
Modular tab-based design:
- **Dashboard**: Stats cards.
- **Orders**: List (Filterable). Add/Edit/Delete Modals.
- **Plumbers**: Cards with "Verify" toggles and "View Orders" eye button.
- **Clients**: List with stats.
- **Compliance**: Dispute management.
- **Settings**: Commission rate input.

### 6.2 Plumber Dashboard (`PlumberDashboard.js`)
- **Header**: Status Badge (Verified/Unverified).
- **Banner**: "Complete Profile" CTA if unverified.
- **Tab 1: Available**:
    - Cards show: Service Type, Urgency (Red background if emergency), Distance/Location.
    - CTA: "CLAIM" (Disabled if unverified).
- **Tab 2: My Jobs**:
    - Active workflow buttons: "Start Job" -> "Complete Job".

### 6.3 Client Dashboard (`ClientDashboard.js`)
- **Tab 1: Orders**:
    - History view.
    - "Pay" and "Dispute" buttons appear on `completed` orders.
- **Tab 2: New Order**:
    - Form with Date/Time picker (logic: Date required only for 'planned').
    - Photo upload/remove.
- **Tab 3: Profile**: Edit Name/Phone.

---

## 7. Security Rules (RLS Summary)
| Role | Select | Insert | Update | Delete |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | ALL | ALL (via logic) | ALL | ALL (Cascade) |
| **Plumber** | Pending Orders + Own Assigned | None | Own Assigned (Status changes only) | None |
| **Client** | Own Orders | Own Orders | Own Orders (Status to Verified) | None |
