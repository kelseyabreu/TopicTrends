// File: src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import JoinSession from './pages/JoinSession';
import SessionView from './pages/SessionView';
import AllSessionsView from './pages/AllSessionsView';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import Header from './components/Header';

function App() {
  return (
    <Router>
      <div className="App">
      <Header />
      <div className="container">
      <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateSession />} />
          <Route path="/join/:sessionId" element={<JoinSession />} />
          <Route path="/sessions" element={<AllSessionsView />} />
          <Route path="/session/:sessionId" element={<SessionView />} />
        </Routes>
      </div>
        <ToastContainer position="bottom-right" />
      </div>
    </Router>
  );
}

export default App;