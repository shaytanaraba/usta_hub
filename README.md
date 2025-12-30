# PlumberHub - Expo Mobile App

A React Native (Expo) version of the PlumberHub marketplace platform for connecting clients with plumbers.

## Features

### Client Features
- Create plumbing service orders
- Track order status in real-time
- View assigned plumber details
- Confirm job completion
- Rate plumber services

### Plumber Features
- View live order feed with auto-refresh
- Claim available orders
- Manage active jobs
- Submit completion reports
- Track earnings and ratings

### Admin Features
- View platform statistics
- Manage all orders
- View registered plumbers
- Track revenue and commissions

## Tech Stack

- **React Native** with Expo
- **React Navigation** for navigation
- **AsyncStorage** for data persistence
- **React Native Safe Area Context** for safe area handling

## Getting Started

### Prerequisites
- Node.js installed
- Expo CLI installed (`npm install -g expo-cli`)
- Expo Go app on your mobile device OR
- Android Studio / Xcode for simulators

### Installation

1. Navigate to the project directory:
```bash
cd plumber-hub-expo
```

2. Install dependencies:
```bash
npm install
```

### Running the App

#### Option 1: Using Expo Go App (Recommended for Testing)
1. Start the development server:
```bash
npx expo start
```
2. Scan the QR code with the Expo Go app on your phone
3. Or press `w` to open in web browser

#### Option 2: Using Android Emulator
1. Start the development server:
```bash
npx expo start
```
2. Press `a` to run on Android emulator

#### Option 3: Using iOS Simulator
1. Start the development server:
```bash
npx expo start
```
2. Press `i` to run on iOS simulator (macOS only)

## Demo Accounts

### Administrator
- **Email**: admin@plumber.com
- **Password**: admin123

### Client
- **Email**: client@test.com
- **Password**: client123

### Plumber
- **Email**: plumber@test.com
- **Password**: plumber123

## Project Structure

```
plumber-hub-expo/
├── App.js                      # Main app component with navigation
├── package.json
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js      # Login/Registration screen
│   │   ├── ClientDashboard.js  # Client dashboard
│   │   ├── PlumberDashboard.js # Plumber dashboard
│   │   └── AdminDashboard.js   # Admin dashboard
│   ├── services/
│   │   ├── auth.js            # Authentication service
│   │   ├── storage.js         # AsyncStorage wrapper
│   │   └── orders.js          # Order management service
│   └── utils/
│       └── helpers.js         # Utility functions
└── assets/
```

## Key Services

### Storage Service (`src/services/storage.js`)
- Manages data persistence using AsyncStorage
- Handles users, orders, settings, and session data
- Initializes with demo data on first run

### Auth Service (`src/services/auth.js`)
- User registration and login
- Session management
- Password validation
- Profile management

### Orders Service (`src/services/orders.js`)
- Order creation and management
- Order claiming for plumbers
- Job completion reporting
- Client confirmation and ratings

## Data Models

### User Object
```javascript
{
  id: 'USR-XXXXXX',
  userType: 'client|plumber|admin',
  email: 'user@example.com',
  password: 'hashed_password',
  name: 'Full Name',
  phone: '+1-555-1234',
  createdAt: '2024-01-15T10:30:00Z',
  plumberProfile: {
    licenseNumber: 'PL123456',
    specializations: ['residential', 'emergency'],
    serviceArea: 'City Name',
    experience: '5 years',
    isVerified: true,
    rating: 4.5,
    completedJobs: 23
  }
}
```

### Order Object
```javascript
{
  id: 'ORD-XXXXXX',
  clientId: 'client_user_id',
  status: 'pending|claimed|in_progress|completed|cancelled',
  urgency: 'emergency|urgent|normal|scheduled',
  serviceDetails: {
    problemDescription: 'Issue description',
    serviceType: 'repair|installation|inspection',
    address: '123 Main St',
    preferredDate: '2024-01-20',
    preferredTime: 'morning|afternoon|evening|anytime'
  },
  assignedPlumber: {
    plumberId: 'plumber_id',
    plumberName: 'Plumber Name',
    claimedAt: '2024-01-15T11:00:00Z'
  },
  completion: {
    workDescription: 'Work completed',
    hoursWorked: 2.5,
    amountCharged: 150.00,
    paymentMethod: 'cash|bank_transfer',
    clientConfirmed: true,
    clientConfirmedAmount: 150.00
  },
  createdAt: '2024-01-15T10:30:00Z'
}
```

## Development Notes

### Auto-Refresh
- Order feed auto-refreshes every 30 seconds for plumbers
- Client orders refresh every 30 seconds
- Pull-to-refresh available on all screens

### Data Persistence
- All data stored locally using AsyncStorage
- Demo accounts pre-seeded on first launch
- Clear storage by uninstalling the app

### State Management
- Uses React hooks (useState, useEffect)
- Services handle data operations
- Components update via state changes

## Future Enhancements

- Real-time push notifications
- In-app chat between clients and plumbers
- Photo upload for order documentation
- GPS integration for location-based matching
- Payment gateway integration
- Multi-language support
- Dark mode

## Troubleshooting

### Metro Bundler Issues
If you encounter bundling issues:
```bash
npx expo start -c
```

### Clear Cache
```bash
npx expo start --clear
```

### Reset App Data
Uninstall and reinstall the app to clear all local data.

## License

This project is provided as a demonstration and educational resource.