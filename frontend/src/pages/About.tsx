import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { 
  Card, 
  CardContent,
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Brain,
  Building2, 
  ChevronRight,
  Compass,
  History, 
  Lightbulb,
  MessageCircleQuestion,
  Network,
  Users, 
  Waves,
  Zap
} from 'lucide-react';
import "../styles/About.css";

function About() {
  return (
    <div className="about-container">
      {/* Hero Section */}
      <div className="about-hero">
        <div className="about-hero-content">
          <h1>Transforming Group Input Into Actionable Insights</h1>
          <p className="about-hero-subtitle">
            TopicTrends uses AI to automatically identify patterns across submissions, 
            revealing collective intelligence that traditional methods miss.
          </p>
        <Link to="/register">
            <Button size="lg">Sign Up</Button>
        </Link>
        </div>
      </div>

      {/* How It Works */}
      <section className="about-section">
        <div className="section-header">
          <Compass className="section-icon" />
          <h2>How TopicTrends Works</h2>
        </div>
        <div className="process-cards">
          <div className="process-card">
            <div className="process-step">1</div>
            <h3>Create a Discussion</h3>
            <p>Leaders set up a focused topic or question to gather input on</p>
          </div>
          <ChevronRight className="process-arrow" />
          <div className="process-card">
            <div className="process-step">2</div>
            <h3>Share with Participants</h3>
            <p>Invite participants via link or QR code to join the conversation</p>
          </div>
          <ChevronRight className="process-arrow" />
          <div className="process-card">
            <div className="process-step">3</div>
            <h3>Collect Ideas</h3>
            <p>Everyone submits their thoughts in their own words, anonymously or verified</p>
          </div>
          <ChevronRight className="process-arrow" />
          <div className="process-card">
            <div className="process-step">4</div>
            <h3>AI Organizes</h3>
            <p>Our algorithm automatically groups similar ideas, identifying key themes</p>
          </div>
          <ChevronRight className="process-arrow" />
          <div className="process-card">
            <div className="process-step">5</div>
            <h3>Discover Insights</h3>
            <p>See real-time results organized by relevance and consensus</p>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="about-section story-section">
        <div className="section-header">
          <History className="section-icon" />
          <h2>Our Story</h2>
        </div>
        <div className="story-content">
          <div className="story-text">
            <p>
              TopicTrends began with a simple observation: in meetings, town halls, and forums worldwide, 
              the same pattern repeats—a few people dominate the conversation while valuable insights from 
              others remain unheard and connections between ideas go unnoticed.
            </p>
            <p>
              Founded in 2024, our team of data scientists, UX designers, and community organizers came 
              together to solve this problem, creating a platform that gives every voice equal weight 
              and reveals the true patterns in group thinking.
            </p>
            <p>
              Our mission is to transform how organizations understand collective input, making it 
              possible to derive meaningful, actionable insights from hundreds or thousands of contributions.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="about-section features-section">
        <div className="section-header">
          <Lightbulb className="section-icon" />
          <h2>Key Features</h2>
        </div>
        <div className="features-grid">
          <Card className="feature-card">
            <CardHeader>
              <Brain className="feature-icon" />
              <CardTitle>AI-Powered Semantic Grouping</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Unlike keyword matching, our deep learning algorithms understand the meaning behind ideas,
                connecting contributions that express the same concept in completely different words.
              </p>
            </CardContent>
          </Card>
          
          <Card className="feature-card">
            <CardHeader>
              <Users className="feature-icon" />
              <CardTitle>Inclusive Participation</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Everyone can contribute equally, whether anonymously or as verified users.
                Each idea receives equal weight, preventing dominant voices from controlling the narrative.
              </p>
            </CardContent>
          </Card>
          
          <Card className="feature-card">
            <CardHeader>
              <Zap className="feature-icon" />
              <CardTitle>Real-Time Results</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                See ideas and groupings update instantly as participants contribute, 
                allowing for dynamic discussion facilitation and immediate insights.
              </p>
            </CardContent>
          </Card>
          
          <Card className="feature-card">
            <CardHeader>
              <Waves className="feature-icon" />
              <CardTitle>Adaptive Clustering</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Our algorithm automatically adjusts to group size, optimizing thresholds
                and clustering parameters whether you have 10 submissions or 10,000.
              </p>
            </CardContent>
          </Card>
          
          <Card className="feature-card">
            <CardHeader>
              <Network className="feature-icon" />
              <CardTitle>Topic Hierarchy</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Understand relationships between ideas with our maritime-themed categorization system:
                Ripples (small groups), Waves (medium), Breakers (large), and Tsunamis (very large).
              </p>
            </CardContent>
          </Card>
          
          <Card className="feature-card">
            <CardHeader>
              <Building2 className="feature-icon" />
              <CardTitle>Enterprise Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Secure, scalable, and designed for organizations of all sizes,
                with support for thousands of concurrent participants.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Use Cases */}
      <section className="about-section use-cases-section">
        <div className="section-header">
          <Users className="section-icon" />
          <h2>Who Uses TopicTrends</h2>
        </div>
        <div className="use-cases-grid">
          <div className="use-case-card">
            <h3>
              <Building2 className="use-case-icon" />
              Government & Public Sector
            </h3>
            <p>
              Transform town halls, public consultations, and community forums into productive
              engagement sessions where every citizen's voice contributes equally.
            </p>
            <ul className="use-case-list">
              <li>Policy consultations</li>
              <li>Budget prioritization</li>
              <li>Community planning</li>
              <li>Crisis response coordination</li>
            </ul>
          </div>
          
          <div className="use-case-card">
            <h3>
              <Users className="use-case-icon" />
              Corporate Leadership
            </h3>
            <p>
              Make all-hands meetings, strategic planning sessions, and team retrospectives
              more productive and inclusive with insights from across the organization.
            </p>
            <ul className="use-case-list">
              <li>Strategic planning</li>
              <li>Employee feedback</li>
              <li>Innovation workshops</li>
              <li>Team retrospectives</li>
            </ul>
          </div>
          
          <div className="use-case-card">
            <h3>
              <Brain className="use-case-icon" />
              Education
            </h3>
            <p>
              Increase student participation and gather meaningful feedback to improve
              curriculum, classroom engagement, and campus resources.
            </p>
            <ul className="use-case-list">
              <li>Classroom discussions</li>
              <li>Course feedback</li>
              <li>Student concerns</li>
              <li>Curriculum development</li>
            </ul>
          </div>
          
          <div className="use-case-card">
            <h3>
              <Zap className="use-case-icon" />
              Event Management
            </h3>
            <p>
              Turn passive attendees into active participants with real-time
              collection and organization of questions, feedback, and ideas.
            </p>
            <ul className="use-case-list">
              <li>Conference Q&A</li>
              <li>Event feedback</li>
              <li>Workshop facilitation</li>
              <li>Panel discussions</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="about-section faq-section">
        <div className="section-header">
          <MessageCircleQuestion className="section-icon" />
          <h2>Frequently Asked Questions</h2>
        </div>
        <Accordion type="single" collapsible className="faq-accordion">
          <AccordionItem value="item-1">
            <AccordionTrigger>What makes TopicTrends different from surveys or polls?</AccordionTrigger>
            <AccordionContent>
              Unlike traditional surveys with predefined answers, TopicTrends lets participants express ideas in their own words. 
              Our AI then finds patterns across these open-ended responses, revealing insights that structured surveys would miss. 
              This approach captures nuance, discovers unexpected connections, and gives everyone an equal voice.
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="item-2">
            <AccordionTrigger>Is TopicTrends only for large groups?</AccordionTrigger>
            <AccordionContent>
              No! While TopicTrends excels with large groups, it's valuable for any size. Even with smaller teams, 
              the automatic organization saves time and reveals connections you might not notice manually. 
              Our algorithm adapts to group size, providing meaningful insights whether you have 10 or 10,000 participants.
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="item-3">
            <AccordionTrigger>How does the AI grouping work?</AccordionTrigger>
            <AccordionContent>
              Our algorithm converts each idea into a mathematical representation called an embedding, then compares the similarity 
              between ideas. Those above a certain threshold are grouped together, with thresholds dynamically adjusted based on group size. 
              Unlike simple keyword matching, our semantic approach understands meaning, identifying similar concepts even when 
              expressed with entirely different terminology.
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="item-4">
            <AccordionTrigger>What's the difference between anonymous and verified participation?</AccordionTrigger>
            <AccordionContent>
              Verified participation requires logging in and shows your username with your ideas. This builds accountability and trust, 
              particularly in professional settings. Anonymous participation doesn't require an account and shows your ideas without 
              identifying information, encouraging candid feedback on sensitive topics. Discussion creators can choose which mode best 
              fits their goals and context.
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="item-5">
            <AccordionTrigger>Can I export the results?</AccordionTrigger>
            <AccordionContent>
              Yes, discussion creators can export results in CSV or PDF format, including all ideas, their groupings, and engagement metrics. 
              This makes it easy to incorporate insights into reports, presentations, or further analysis. The exports maintain the 
              hierarchical structure identified by our AI, preserving the relationships between ideas and topics.
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="item-6">
            <AccordionTrigger>Is my data secure?</AccordionTrigger>
            <AccordionContent>
              Yes. All data is encrypted both in transit and at rest. We use industry-standard security practices and never share your 
              discussions or user information with third parties. Our platform meets enterprise security requirements and is designed 
              with privacy in mind, giving discussion creators full control over their data.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* CTA */}
      <section className="about-cta">
        <h2>Ready to transform how you collect group input?</h2>
        <p>
          Join thousands of organizations using TopicTrends to harness the power of collective intelligence.
        </p>
        <div className="cta-buttons">
          <Link to="/register">
            <Button size="lg">Sign Up</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default About;