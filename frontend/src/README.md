# TopicTrends Frontend

A modern React application for tracking and analyzing trending topics.

## Tech Stack

- **React** (v18.3.1) - A JavaScript library for building user interfaces
- **TypeScript** - For type-safe code
- **Vite** (v6.3.1) - Next generation frontend tooling
- **Tailwind CSS** (v4.1.4) - A utility-first CSS framework
- **shadcn/ui** - Unstyled, accessible components based on Radix UI
- **Socket.io Client** (v4.7.2) - For real-time communication
- **React Router DOM** (v6.21.1) - For application routing
- **React Toastify** (v9.1.3) - For toast notifications

## Prerequisites

- Node.js (v22.14.0)
- npm or yarn package manager

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui components
│   │   │   ├── accordion.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── textarea.tsx
│   │   ├── Header.tsx
│   │   └── ProtectedRoute.tsx
│   ├── interfaces/          # TypeScript interfaces
│   │   ├── clusters.ts
│   │   ├── ideas.ts
│   │   └── sessions.ts
│   ├── lib/                 # Utility functions
│   │   └── utils.ts
│   ├── pages/               # Page components
│   │   ├── AllSessionsView.tsx
│   │   ├── ClusterView.tsx
│   │   ├── CreateSession.tsx
│   │   ├── Home.tsx
│   │   ├── JoinSession.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── SessionView.tsx
│   │   ├── UserSettings.tsx
│   │   └── VerifyEmail.tsx
│   ├── services/            # API and authentication services
│   │   └── authService.tsx
│   ├── styles/              # CSS styles
│   │   ├── AllSessionsView.css
│   │   ├── Auth.css
│   │   ├── ClusterView.css
│   │   ├── CreateSession.css
│   │   ├── Header.css
│   │   ├── Home.css
│   │   ├── JoinSession.css
│   │   └── SessionView.css
│   ├── utils/               # Utility functions
│   │   └── api.ts
│   ├── App.css
│   ├── App.tsx              # Root component
│   ├── index.css
│   ├── main.tsx             # Application entry point
│   └── vite-env.d.ts        # Vite type declarations
├── public/                  # Static assets
├── README.md                # React + TypeScript + Vite README
├── index.html               # Main HTML entry point
└── package.json             # Project dependencies and scripts
```

## Key Features

- **User Authentication**: Register, login, and email verification
- **Session Management**: Create and join discussion sessions
- **Real-time Updates**: See new ideas and groupings instantly
- **Idea Clustering**: Automatically grouped ideas by similarity
- **Maritime Theme**: Clusters are categorized by size as:
  - **Ripples**: Small groups (≤10 ideas)
  - **Waves**: Medium groups (11-25 ideas)
  - **Breakers**: Large groups (26-50 ideas)
  - **Tsunamis**: Very large groups (>50 ideas)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:5173`