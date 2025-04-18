import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.tsx';
import CreateSession from './pages/CreateSession.tsx';
import JoinSession from './pages/JoinSession.tsx';
import SessionView from './pages/SessionView.tsx';
import AllSessionsView from './pages/AllSessionsView.tsx';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import Header from './components/Header.tsx';
import ClusterView from './pages/ClusterView';

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
                <Route path="/session/:sessionId/cluster/:clusterId" element={<ClusterView />} />
                </Routes>
            </div>
            <ToastContainer position="bottom-right" />
        </div>
        </Router>

    )
}
  
export default App