// File: src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import JoinSession from './pages/JoinSession';
import SessionView from './pages/SessionView';
import AllSessionsView from './pages/AllSessionsView';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import UserSettings from './pages/UserSettings';
import ProtectedRoute from './components/ProtectedRoute';
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
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/verify" element={<VerifyEmail />} />
                        <Route path="/create" element={<CreateSession />} />
                        <Route path="/join/:sessionId" element={<JoinSession />} />
                        <Route path="/sessions" element={<AllSessionsView />} />
                        <Route path="/session/:sessionId" element={<SessionView />} />
                        <Route
                            path="/settings"
                            element={
                                <ProtectedRoute>
                                    <UserSettings />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </div>
                <ToastContainer position="bottom-right" />
            </div>
        </Router>
    );
}

export default App;