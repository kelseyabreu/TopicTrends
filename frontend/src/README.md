# TopicTrends Frontend

A modern React application for tracking and analyzing trending topics.

## Tech Stack

- **React** (v18.3.1) - A JavaScript library for building user interfaces
- **TypeScript** - For type-safe code
- **Vite** - Next generation frontend tooling
- **Tailwind CSS** - A utility-first CSS framework
- **Radix UI** - Unstyled, accessible components for building high‑quality design systems
- **Socket.io Client** - For real-time communication
- **React Router DOM** - For application routing
- **React Toastify** - For toast notifications

## Prerequisites

- Node.js (v22.14.0)
- npm or yarn package manager

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/kelseyabreu/TopicTrends.git
cd TopicTrends/frontend


frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/             # UI component library
│   │   ├── Header.tsx
│   │   └── ProtectedRoute.tsx
│   ├── interfaces/         # TypeScript interfaces
│   │   ├── clusters.ts
│   │   ├── ideas.ts
│   │   └── sessions.ts
│   ├── pages/             # Page components
│   │   ├── AllSessionsView.tsx
│   │   ├── ClusterView.tsx
│   │   ├── CreateSession.tsx
│   │   ├── Home.tsx
│   │   ├── JoinSession.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── SessionView.tsx
│   │   └── VerifyEmail.tsx
│   ├── services/          # API and authentication services
│   │   ├── authService.tsx
│   │   └── api.ts
│   ├── styles/            # CSS styles
│   │   ├── AllSessionsView.css
│   │   ├── Auth.css
│   │   ├── ClusterView.css
│   │   ├── CreateSession.css
│   │   ├── Header.css
│   │   ├── Home.css
│   │   └── JoinSession.css
│   ├── utils/             # Utility functions
│   ├── App.css
│   ├── App.tsx           # Root component
│   ├── index.css
│   ├── main.tsx          # Application entry point
│   └── vite-env.d.ts     # Vite type declarations
└── public/               # Static assets
└── package.json       # Project dependencies and scripts