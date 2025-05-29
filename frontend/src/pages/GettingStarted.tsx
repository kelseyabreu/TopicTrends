// src/pages/GettingStarted.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Lightbulb,
    MessageSquare,
    Users,
    Share2,
    Zap,
    Brain,
    Layers,
    Settings2,
    BarChart3,
    LogIn,
    UserPlus,
    ChevronRight,
    KeyRound,
    Lock,
    HelpCircle
} from 'lucide-react';
import "../styles/GettingStarted.css"; // You'll create this CSS file

const GettingStartedPage: React.FC = () => {

    const SectionCard: React.FC<{
        title: string;
        icon: React.ElementType;
        children: React.ReactNode;
    }> = ({ title, icon: Icon, children }) => (
        <Card className="getting-started-section">
            <CardHeader>
                <CardTitle className="flex items-center text-xl">
                    <Icon className="w-6 h-6 mr-3 text-primary" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {children}
            </CardContent>
        </Card>
    );

    return (
        <div className="getting-started-container">
            <header className="getting-started-hero">
                <h1>Welcome to TopicTrends!</h1>
                <p className="text-lg text-muted-foreground">
                    Unlock collective intelligence. Gather ideas, discover patterns, and gain insights effortlessly.
                </p>
            </header>

            <div className="getting-started-grid">
                {/* Section 1: What is TopicTrends? */}
                <SectionCard title="What is TopicTrends?" icon={HelpCircle}>
                    <p>
                        TopicTrends is a platform designed to help you collect ideas from a group and automatically organize them.
                        Using AI, it identifies common themes and patterns within submissions, even if they're phrased differently.
                    </p>
                    <p>
                        <strong>Use it for:</strong> Brainstorming, feedback collection, town halls, community engagement, and more!
                    </p>
                </SectionCard>

                {/* Section 2: Your Account */}
                <SectionCard title="Your Account" icon={Users}>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <UserPlus className="w-5 h-5 mr-2" />
                                <span><strong>Register:</strong> Create a new account to host discussions and save your activity.</span>
                            </div>
                            <Button size="sm" asChild>
                                <Link to="/register">Register <ChevronRight className="w-4 h-4 ml-1" /></Link>
                            </Button>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <LogIn className="w-5 h-5 mr-2" />
                                <span><strong>Login:</strong> Access your existing account.</span>
                            </div>
                            <Button size="sm" asChild>
                                <Link to="/login">Login <ChevronRight className="w-4 h-4 ml-1" /></Link>
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            You'll need to verify your email after registering. If you forget your password, use the "Forgot Password" link on the login page.
                        </p>
                    </div>
                </SectionCard>

                {/* Section 3: Creating & Managing Discussions (For Facilitators) */}
                <SectionCard title="Discussions" icon={MessageSquare}>
                    <CardDescription>
                        Discussions are TopicTrends' foundational building block. As host/admin, you create
                        powerful idea-gathering sessions where AI organizes responses into clear themes,
                        helping you unlock patterns hidden in your participants's thoughts.
                    </CardDescription>
                    <div className="space-y-2 mt-3">
                        <p><strong>1. Create a Discussion:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>Navigate to <Link to="/create" className="text-primary hover:underline">Create Discussion</Link>.</li>
                            <li>Enter a clear <strong>Title</strong> (e.g., "Improving Our Community Park").</li>
                            <li>Write a concise <strong>Prompt</strong> that guides participants (e.g., "What features would you like to see added or improved in the local park?").</li>
                            <li>Decide if participation <strong>Requires Verification</strong> (users must log in). Uncheck for anonymous contributions.</li>
                            <li>Click "Create Discussion."</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>2. Share Your Discussion:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>Once created, you'll land on the Discussion View page.</li>
                            <li>Click the <Share2 className="inline w-4 h-4" /> <strong>Share</strong> button.</li>
                            <li>Copy the unique <strong>Join Link</strong> or let participants scan the <strong>QR Code</strong>.</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>3. Manage Ideas:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>As ideas come in, our AI works in the background.</li>
                            <li>Click <Zap className="inline w-4 h-4" /> <strong>Regroup All Ideas</strong> on the Discussion View page to manually trigger AI clustering at any time. This organizes submitted ideas into "Currents" (topics).</li>
                            <li>View "Drifting Ideas" (unprocessed/unclustered ideas) and regroup them.</li>
                        </ul>
                    </div>
                </SectionCard>

                {/* Section 4: Participating in Discussions */}
                <SectionCard title="Participating & Submitting Ideas" icon={Lightbulb}>
                    <CardDescription>Contribute your thoughts to ongoing discussions.</CardDescription>
                    <div className="space-y-2 mt-3">
                        <p><strong>1. Join a Discussion:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>Access a discussion via a shared link or QR code.</li>
                            <li>If it requires verification, you'll be prompted to log in. Otherwise, you can participate anonymously.</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>2. Submit an Idea:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>On the Discussion View page, click <Lightbulb className="inline w-4 h-4" /> <strong>New Idea</strong>.</li>
                            <li>Type your idea in the text area (max 500 characters).</li>
                            <li>Click "Submit Idea." Your contribution is added!</li>
                        </ul>
                        <p className="text-sm text-muted-foreground pl-4">
                            Logged-in users' ideas are marked as "Verified." Anonymous users' ideas are marked as "Anonymous" (if allowed by the discussion settings).
                        </p>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>3. Interact with Content:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>You can <strong>Like</strong>, <strong>Pin</strong>, or <strong>Save</strong> discussions, topics, and individual ideas that resonate with you (requires login).</li>
                        </ul>
                    </div>
                </SectionCard>

                {/* Section 5: Understanding AI & Topics */}
                <SectionCard title="The Magic: AI & Topics" icon={Brain}>
                    <CardDescription>How TopicTrends organizes and makes sense of ideas.</CardDescription>
                    <div className="space-y-2 mt-3">
                        <p><strong>AI Processing:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>When you submit an idea, our AI (powered by Genkit and Google AI) analyzes it for:
                                <ul className="list-disc list-inside text-sm space-y-1 pl-6">
                                    <li><strong>Intent:</strong> What is the purpose (e.g., suggestion, question, complaint)?</li>
                                    <li><strong>Sentiment:</strong> Is it positive, negative, or neutral?</li>
                                    <li><strong>Specificity:</strong> How detailed is the idea (broad vs. specific)?</li>
                                    <li><strong>On-Topic Score:</strong> How relevant is it to the discussion's prompt?</li>
                                    <li><strong>Keywords:</strong> Main terms and concepts.</li>
                                </ul>
                            </li>
                            <li>The AI also creates an "embedding" (a numerical representation) of your idea's meaning.</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>Topic Clustering ("Currents"):</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>TopicTrends uses these embeddings to group semantically similar ideas together into "Currents" (topics). This happens automatically via a background worker or when a facilitator clicks "Regroup All Ideas."</li>
                            <li>Each Current is represented by a key idea and given a descriptive title by AI.</li>
                            <li>The size of a Current (Ripple, Wave, Breaker, Tsunami) indicates how many similar ideas it contains.</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>Drill-Down into Topics:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>Facilitators (or any user, depending on settings) can click on a Current to "drill-down." This re-clusters the ideas *within* that Current to find more granular sub-topics.</li>
                        </ul>
                    </div>
                </SectionCard>

                {/* Section 6: Exploring & Insights */}
                <SectionCard title="Exploring & Gaining Insights" icon={Layers}>
                    <CardDescription>Navigate and understand the collective intelligence.</CardDescription>
                    <div className="space-y-2 mt-3">
                        <p><strong>Viewing Topics:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>On the Discussion View, you'll see a list of Currents. Click one to expand it and see the ideas within.</li>
                            <li>Explore <Link to="/ideas" className="text-primary hover:underline">All Ideas</Link> across the platform (if logged in) with advanced filtering and sorting.</li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>Analytics:</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li>Facilitators can access the <BarChart3 className="inline w-4 h-4" /> <strong>Analytics</strong> page for a discussion to see:
                                <ul className="list-disc list-inside text-sm space-y-1 pl-6">
                                    <li>Participation metrics (total ideas, unique users).</li>
                                    <li>Topic distribution and unclustered idea counts.</li>
                                    <li>Real-time engagement (active users, recent ideas).</li>
                                    <li>Interaction metrics (views, likes, pins, saves).</li>
                                    <li>Trending topics and ideas.</li>
                                </ul>
                            </li>
                        </ul>
                    </div>
                    <div className="space-y-2 mt-3">
                        <p><strong>Your Personalized Views (Logged-in Users):</strong></p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-4">
                            <li><Link to="/my-ideas" className="text-primary hover:underline">My Ideas</Link>: See all ideas you've submitted.</li>
                            <li><Link to="/my-interactions" className="text-primary hover:underline">My Interactions</Link>: A log of your likes, pins, saves, and views.</li>
                            <li><Link to="/dashboard" className="text-primary hover:underline">Dashboard</Link>: Overview of your created discussions, participation stats, and engagement.</li>
                            <li><Link to="/settings" className="text-primary hover:underline">Settings</Link>: Update your profile information.</li>
                        </ul>
                    </div>
                </SectionCard>
            </div>

            <div className="getting-started-next-steps">
                <h2>What's Next?</h2>
                <p>You're all set to explore TopicTrends! Here are a few things you can do:</p>
                <div className="next-steps-buttons">
                    <Button asChild>
                        <Link to="/create">Create Your First Discussion</Link>
                    </Button>
                    <Button asChild>
                        <Link to="/discussions">Explore Existing Discussions</Link>
                    </Button>
                    <Button variant="neutral" asChild>
                        <Link to="/about">Learn More About Us</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default GettingStartedPage;