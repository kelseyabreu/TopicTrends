import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
    Sparkles, Target, BrainCircuit, Users2, SearchCheck, TrendingUp, Layers,
    ShieldEllipsis, CheckSquare, Workflow, LightbulbOff, MessageCircleDashed, GitFork,
    Hourglass, Eye, ThumbsUp, Rocket, MessageSquareText, Landmark,Briefcase,GraduationCap,UserCheck,Info, UnfoldVertical, GalleryHorizontalEnd, Filter, Diamond,
    Puzzle, BarChartBig, Settings, CloudCog, LockKeyhole, Presentation, MapPinned,
    Palette, RotateCcwSquare, LineChart
} from 'lucide-react';

// --- Reimagined Components for this Page ---

const ValuePropBlock = ({ icon, title, children, className }: { icon: React.ReactNode, title: string, children: React.ReactNode, className?: string }) => (
    <div className={`p-6 rounded-xl bg-gradient-to-br from-background via-card/80 to-background shadow-lg backdrop-blur-md border border-border/50 ${className}`}>
        <div className="flex items-center text-primary mb-3">
            {React.cloneElement(icon as React.ReactElement, { className: "w-8 h-8 mr-3" })}
            <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
);

const StepPillar = ({ number, title, description, icon }: { number: string, title: string, description: string, icon: React.ReactNode }) => (
    <div className="flex flex-col items-center p-6 text-center rounded-lg transition-all duration-300 hover:bg-primary/5 hover:shadow-lg">
        <div className="mb-4 p-3 rounded-full bg-primary/10 text-primary">
            {React.cloneElement(icon as React.ReactElement, { className: "w-10 h-10" })}
        </div>
        <div className="mb-2 flex items-baseline justify-center">
            <span className="text-3xl font-bold text-primary mr-1">{number}</span>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
    </div>
);

const ImpactStory = ({ title, scenario, outcome, Icon }: { title: string, scenario: string, outcome: string, Icon: React.ElementType }) => (
    <Card className="bg-card/70 backdrop-blur-sm shadow-md hover:shadow-lg transition-transform hover:scale-[1.02]">
        <CardHeader className="pb-3">
            <div className="flex items-center mb-2">
                <Icon className="w-6 h-6 mr-3 text-primary" />
                <CardTitle className="text-lg">{title}</CardTitle>
            </div>
            <CardDescription className="text-xs italic">"{scenario}"</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-foreground/90">
                <span className="font-semibold text-primary">Outcome with TopicTrends:</span> {outcome}
            </p>
        </CardContent>
    </Card>
);

const PitchPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-foreground">

            {/* Section 1: The Grand Challenge - Beyond Surface Noise */}
            <section className="relative py-24 md:py-36 text-white overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-slate-800 to-blue-900 opacity-95"></div>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("/visual-noise-abstract.svg")' }}></div> {/* Conceptual background */}

                <div className="container mx-auto px-6 relative z-10 text-center">
                    <Sparkles className="w-16 h-16 text-yellow-400 mx-auto mb-6 animate-pulse" />
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6">
                        Drowning in Feedback? <span className="block text-primary">Discover the True Signal.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed">
                        Traditional feedback collection is broken. You get a flood of voices, but the real insights—the underlying currents of opinion and priority—remain hidden. It's time to move beyond the noise.
                    </p>
                    <Button asChild size="lg" className="px-10 py-4 text-lg bg-primary hover:bg-primary/80 text-primary-foreground rounded-full shadow-xl transform hover:scale-105 transition-all">
                        <Link to="/register">Uncover Your Insights Now</Link>
                    </Button>
                </div>
            </section>

            {/* Section 2: The Hidden Costs of Misunderstanding */}
            <section className="py-16 md:py-24 bg-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 md:mb-16">
                        <LightbulbOff className="w-12 h-12 text-destructive mx-auto mb-4" />
                        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">The Silent Toll of Unseen Patterns</h2>
                        <p className="text-md text-muted-foreground max-w-2xl mx-auto mt-3">
                            When you can't see the forest for the trees in your feedback, the consequences are real and costly.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8 text-center">
                        <div className="p-6">
                            <MessageCircleDashed className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                            <h3 className="text-lg font-medium mb-1">Missed Opportunities</h3>
                            <p className="text-xs text-muted-foreground">Innovative ideas get lost, and crucial warnings go unheeded.</p>
                        </div>
                        <div className="p-6">
                            <GitFork className="w-10 h-10 text-red-500 mx-auto mb-3" />
                            <h3 className="text-lg font-medium mb-1">Wasted Resources</h3>
                            <p className="text-xs text-muted-foreground">Time and money spent addressing symptoms, not root causes.</p>
                        </div>
                        <div className="p-6">
                            <Hourglass className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                            <h3 className="text-lg font-medium mb-1">Disengaged Audiences</h3>
                            <p className="text-xs text-muted-foreground">Participants feel unheard, leading to frustration and apathy.</p>
                        </div>
                    </div>
                </div>
            </section>

            <Separator className="my-12 md:my-16 w-3/4 mx-auto" />

            {/* Section 3: The TopicTrends Catalyst */}
            <section className="py-16 md:py-24">
                <div className="container mx-auto px-6 text-center">
                    <img src="/logo-symbol.svg" alt="TopicTrends Catalyst" className="w-20 h-20 mx-auto mb-6 text-primary" /> {/* Replace with actual logo */}
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-primary mb-4">
                        Introducing Topic<span className="text-foreground">Trends</span>: Your Insight Engine
                    </h2>
                    <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
                        TopicTrends is not just another tool; it's a paradigm shift. We empower you to instantly cut through the clutter and tap into the genuine collective intelligence of any group.
                    </p>
                    <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8">
                        <ValuePropBlock icon={<BrainCircuit />} title="AI-Driven Clarity">
                            Our advanced semantic AI doesn't just count words; it understands intent and context, revealing connections others miss.
                        </ValuePropBlock>
                        <ValuePropBlock icon={<Users2 />} title="Democratized Voice">
                            Every idea is weighted equally. Anonymous options ensure candor. True insights emerge, free from a few dominant voices.
                        </ValuePropBlock>
                        <ValuePropBlock icon={<TrendingUp />} title="Actionable Foresight">
                            Move from data overwhelm to decisive action. Identify key themes, prioritize effectively, and respond with confidence.
                        </ValuePropBlock>
                    </div>
                </div>
            </section>

            {/* Section 4: Illuminating the Path from Input to Impact */}
            <section className="py-16 md:py-24 bg-slate-50 dark:bg-slate-900/70">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 md:mb-16">
                        <Workflow className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Your Journey to Understanding</h2>
                        <p className="text-md text-muted-foreground max-w-2xl mx-auto mt-3">A streamlined flow from raw ideas to strategic clarity.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                        <StepPillar number="01" title="Launch & Invite" description="Define your question, create a Discussion, and share the unique link or QR code." icon={<Rocket />} />
                        <StepPillar number="02" title="Gather Voices" description="Participants contribute their thoughts and ideas through an intuitive interface, on any device." icon={<MessageSquareText />} />
                        <StepPillar number="03" title="AI Synthesizes" description="Our engine works in real-time, embedding and clustering submissions based on deep semantic understanding." icon={<BrainCircuit />} />
                        <StepPillar number="04" title="Discover & Act" description="Visualize emergent Topics, explore underlying ideas, and gain prioritized insights for informed decisions." icon={<SearchCheck />} />
                    </div>
                </div>
            </section>

            {/* Section 5: TopicTrends in Action - Transforming Industries */}
            <section className="py-16 md:py-24">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 md:mb-16">
                        <Presentation className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Making an Impact, Sector by Sector</h2>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                        <ImpactStory
                            Icon={Landmark}
                            title="City Planning Reinvented"
                            scenario="A city council struggled to synthesize feedback from hundreds of residents on a new park design."
                            outcome="TopicTrends identified 'Improved Safety Lighting' and 'More Family Picnic Areas' as top consensual themes, guiding budget allocation effectively."
                        />
                        <ImpactStory
                            Icon={Briefcase}
                            title="Corporate Strategy Aligned"
                            scenario="A CEO needed to understand employee sentiment on a major organizational change during an all-hands meeting."
                            outcome="Key concerns around 'Communication Clarity' and 'Training Support' were surfaced by TopicTrends in minutes, allowing immediate addressal."
                        />
                        <ImpactStory
                            Icon={GraduationCap}
                            title="Curriculum Co-Creation"
                            scenario="A university department wanted diverse student input on a new course syllabus before finalizing it."
                            outcome="TopicTrends highlighted strong student interest in 'Practical Case Studies' and 'Guest Industry Speakers,' leading to a more popular and relevant course."
                        />
                        <ImpactStory
                            Icon={MapPinned}
                            title="Event Agendas That Resonate"
                            scenario="A conference organizer needed to select breakout session topics that would genuinely interest their diverse attendees."
                            outcome="By collecting pre-conference suggestions, TopicTrends pinpointed 'AI Ethics' and 'Sustainable Tech' as highly desired themes, maximizing session attendance."
                        />
                    </div>
                </div>
            </section>

            {/* Section 6: Peek Inside the Engine (Tech Highlights) */}
            <section className="py-16 md:py-24 bg-gradient-to-b from-muted/20 to-background">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12 md:mb-16">
                        <Settings className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Powered by Intelligent Technology</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                        <div className="p-4">
                            <Layers className="w-8 h-8 text-primary mx-auto mb-3" />
                            <h4 className="text-md font-medium mb-1">Semantic Embeddings</h4>
                            <p className="text-xs text-muted-foreground">Nomic-Embed-Text & advanced models transform ideas into rich vector representations.</p>
                        </div>
                        <div className="p-4">
                            <Puzzle className="w-8 h-8 text-primary mx-auto mb-3" />
                            <h4 className="text-md font-medium mb-1">Smart Clustering</h4>
                            <p className="text-xs text-muted-foreground">Algorithms group semantically similar ideas, adapting to data volume and diversity.</p>
                        </div>
                        <div className="p-4">
                            <Palette className="w-8 h-8 text-primary mx-auto mb-3" />
                            <h4 className="text-md font-medium mb-1">Generative Naming</h4>
                            <p className="text-xs text-muted-foreground">Gemma3 and other LLMs provide concise, representative names for emergent topics.</p>
                        </div>
                        <div className="p-4">
                            <CloudCog className="w-8 h-8 text-primary mx-auto mb-3" />
                            <h4 className="text-md font-medium mb-1">Async & Real-Time</h4>
                            <p className="text-xs text-muted-foreground">FastAPI backend with Socket.IO for responsive processing and live updates. (Multi-user sync improving!)</p>
                        </div>
                    </div>
                </div>
            </section>


            {/* Section 7: Built for Trust & The Future */}
            <section className="py-16 md:py-24">
                <div className="container mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div className="order-2 lg:order-1">
                            <img src="/future-of-understanding.jpg" alt="Abstract representing future insights" className="rounded-xl shadow-2xl aspect-video object-cover" />
                            {/* Replace with a relevant image */}
                        </div>
                        <div className="order-1 lg:order-2">
                            <div className="flex items-center mb-4 text-primary">
                                <ShieldEllipsis className="w-8 h-8 mr-3" />
                                <h2 className="text-3xl font-semibold">Engineered for Trust, Designed for Growth.</h2>
                            </div>
                            <p className="text-muted-foreground mb-6 leading-relaxed">
                                We're committed to robust security (HttpOnly cookies, CSRF protection are top priorities) and scalable infrastructure. Your data's integrity and your ability to grow with us are paramount.
                            </p>
                            <ul className="space-y-3 text-sm">
                                <li className="flex items-start"><LockKeyhole className="w-5 h-5 text-green-500 mr-2 shrink-0 mt-0.5" /><span>Data encrypted in transit & at rest.</span></li>
                                <li className="flex items-start"><UserCheck className="w-5 h-5 text-green-500 mr-2 shrink-0 mt-0.5" /><span>Anonymous & verified participation options.</span></li>
                                <li className="flex items-start"><RotateCcwSquare className="w-5 h-5 text-green-500 mr-2 shrink-0 mt-0.5" /><span>Ongoing development in advanced user management, analytics, and AI refinement.</span></li>
                            </ul>
                            <Button variant="outline" asChild className="mt-8">
                                <Link to="/roadmap">View Our Public Roadmap <Info className="w-4 h-4 ml-2" /></Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>


            {/* Section 8: FAQ */}
            <section className="py-16 md:py-24 bg-slate-100 dark:bg-slate-900">
                <div className="container mx-auto px-6 max-w-3xl">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-semibold">Common Curiosities</h2>
                    </div>
                    <Accordion type="single" collapsible className="w-full bg-background p-6 rounded-lg shadow-md">
                        <AccordionItem value="faq-1">
                            <AccordionTrigger className="hover:no-underline">How quickly can I see results?</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">
                                Results begin to appear in near real-time as ideas are submitted. The AI grouping happens continuously, so themes emerge dynamically. Full processing for very large batches may take a short while, but initial insights are quick.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="faq-2">
                            <AccordionTrigger className="hover:no-underline">Can I export data from TopicTrends?</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">
                                Yes! While full admin export functionality is on the roadmap, our goal is to allow discussion owners/admins to export raw ideas and summarized topic data (e.g., in CSV or JSON) for further analysis or reporting.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="faq-3">
                            <AccordionTrigger className="hover:no-underline">What if the AI groups things incorrectly?</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">
                                AI is powerful but not infallible. Future versions will incorporate mechanisms for users to refine topics—like merging, splitting, or reassigning ideas—to enhance accuracy and provide feedback to the system.
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="faq-4">
                            <AccordionTrigger className="hover:no-underline">How does TopicTrends handle different languages?</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">
                                Currently, our primary focus is English. However, many underlying embedding models have multilingual capabilities. Official multilingual support, including automatic translation and language-specific clustering, is a planned future enhancement.
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </section>

            {/* Section 9: Final CTA */}
            <section className="py-20 md:py-32 text-center bg-gradient-to-br from-blue-600 via-primary to-indigo-700 text-white">
                <div className="container mx-auto px-6">
                    <BarChartBig className="w-16 h-16 mx-auto mb-6 opacity-80" />
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Ready to Illuminate Your Collective Genius?</h2>
                    <p className="text-lg md:text-xl mb-12 max-w-2xl mx-auto text-blue-100">
                        Stop guessing. Start understanding. TopicTrends is your partner in transforming raw feedback into strategic advantage.
                    </p>
                    <div className="space-y-4 sm:space-y-0 sm:space-x-4">
                        <Button asChild size="xl" className="bg-white text-primary hover:bg-slate-100 px-10 py-4 rounded-full shadow-2xl transform hover:scale-105 transition-all text-md font-semibold">
                            <Link to="/register">Claim Your Free Account</Link>
                        </Button>
                        <Button asChild variant="link" size="xl" className="text-white hover:text-blue-200 px-10 py-4 text-md">
                            <Link to="/about">Explore Features In-Depth <Diamond className="w-4 h-4 ml-2" /></Link>
                        </Button>
                    </div>
                </div>
            </section>

            <footer className="py-10 text-center text-xs text-muted-foreground bg-background border-t">
                <p>© {new Date().getFullYear()} TopicTrends. Powered by Insight. Driven by AI.</p>
                <p className="mt-1">
                    <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link> | <Link to="/terms" className="hover:text-primary">Terms of Service</Link>
                </p>
            </footer>
        </div>
    );
};

export default PitchPage;