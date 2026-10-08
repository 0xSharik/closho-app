# Closho – Clothes & Shoes App

"Wear it Today" - A premium fashion e-commerce application built with React Native and Expo Router.

## Features
- **Premium Dark UI**: A meticulously crafted pure-black design system with golden accents.
- **Blinkit-Style Store Selection**: The app is multi-store ready. It allows location-based auto-selection of the nearest inventory store.
- **Instagram-Style Reels**: Built-in support for vertical trending video feeds to drive engagement.
- **Robust Authentication**: Full JWT-based auth flow (Login, Register, Forgot Password, OTP).
- **Production Ready Architecture**: Strictly typed with TypeScript, Zustand for global state, and an Axios API layer ready to plug into a backend.

## Tech Stack
- **Framework**: React Native (Expo SDK 57)
- **Routing**: Expo Router (File-based)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod
- **Networking**: Axios
- **Storage**: Expo SecureStore + AsyncStorage

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo Go app on your physical device (or iOS/Android simulator)

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

### Running the App
Start the Expo development server:
```bash
npx expo start
```
- Press `i` to run on iOS simulator.
- Press `a` to run on Android emulator.
- Press `w` to run on Web.
- Scan the QR code with the Expo Go app to test on a physical device.

## API Integration & Mock Data
The app currently uses mocked logic in the frontend to demonstrate the UX. 
All expected backend endpoints are strictly documented in the `API_CONTRACT.md` file located in the project root.

To connect the app to a real backend:
1. Update `EXPO_PUBLIC_API_URL` in your `.env` file.
2. Remove the mock delays and hardcoded data blocks in the component handlers (e.g. `login.tsx`, `cart.tsx`, `index.tsx`) and wire them to the `src/services` layer.

## Folder Structure
- `app/`: Expo Router screens (Auth flow, Tabs, Modals).
- `src/components/`: Reusable UI components (Buttons, Inputs, Product Cards).
- `src/theme/`: Global design system tokens (Colors, Typography, Spacing).
- `src/store/`: Zustand state stores.
- `src/types/`: TypeScript definitions.
- `src/services/`: Axios instance and API integrations.

## License
MIT
