import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.tsx';
import CreateDiscussion from './pages/CreateDiscussion.tsx';
import JoinDiscussion from './pages/JoinDiscussion.tsx';
import DiscussionView from './pages/DiscussionView.tsx';
import AllDiscussionsView from './pages/AllDiscussionsView.tsx';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import Header from './components/Header.tsx';
import TopicView from './pages/TopicView';
import ProtectedRoute from './guards/ProtectedRoute.tsx';
import UserSettings from './pages/UserSettings.tsx';
import IdeaView from './pages/IdeaView.tsx';

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
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/create" element={<CreateDiscussion />} />
                        <Route path="/ideas/:ideaId" element={<IdeaView />} />
                        <Route path="/join/:discussionId" element={<JoinDiscussion />} />
                        <Route path="/discussions" element={<AllDiscussionsView />} />
                        <Route path="/discussion/:discussionId" element={<DiscussionView />} />
                        <Route path="/discussion/:discussionId/topic/:topicId" element={<TopicView />} />
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

    )
}
  
export default App