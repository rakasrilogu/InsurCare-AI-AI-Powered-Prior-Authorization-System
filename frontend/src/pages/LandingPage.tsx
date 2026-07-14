import { Link } from 'react-router-dom';
import { Brain, ArrowRight, Shield, Zap, Clock, Users, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import heroBg from '@/assets/hero-bg.jpg';

const features = [
  { icon: Brain, title: '6-Agent AI System', description: 'Autonomous agents for Intake, Eligibility, Policy, Decision, Risk & Communication.' },
  { icon: Zap, title: 'Under 2 Hours', description: 'Reduce PA processing from 7-14 days to under 2 hours with AI automation.' },
  { icon: Shield, title: 'Explainable Decisions', description: 'Every decision backed by exact policy clause citations and confidence scores.' },
  { icon: Users, title: 'Multi-Stakeholder', description: 'Built for Doctors, Admins, Patients, and Insurers — all in one platform.' },
];

const stats = [
  { value: '78%', label: 'Approval Rate' },
  { value: '<2hrs', label: 'Processing Time' },
  { value: '80%', label: 'Fewer Errors' },
  { value: '₹50-80L', label: 'Saved per Year' },
];

const benefits = [
  'Doctors save up to 13 hours/week',
  '65% admin workload reduction',
  '80% fewer claim denials',
  'ROI up to 13x, payback under 30 days',
  'Insurer-agnostic RAG — just upload policy PDFs',
  'Patient Risk Score auto-prioritizes urgent cases',
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
              <Brain className="w-5 h-5 text-secondary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">InsurCare AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/login">
              <Button size="sm" className="gradient-accent text-secondary-foreground border-0">
                Get Started <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(230,54%,12%)] via-[hsl(230,54%,12%)]/90 to-transparent" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-32 grid lg:grid-cols-2 gap-16 items-center">
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-sm font-medium mb-6">
              <Zap className="w-4 h-4" /> AI-Powered Healthcare Automation
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6" style={{ color: 'white' }}>
              Prior Authorization in{' '}
              <span className="text-gradient">Under 2 Hours</span>
            </h1>
            <p className="text-lg mb-8" style={{ color: 'hsl(220, 20%, 75%)' }}>
              InsurCare AI replaces the 7-14 day manual PA process with an autonomous 6-agent system. 
              Explainable decisions, exact policy citations, and doctor guidance — all automated.
            </p>
            <div className="flex gap-4">
              <Link to="/login">
                <Button size="lg" className="gradient-accent text-secondary-foreground border-0 text-base px-8">
                  Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/pipeline">
                <Button size="lg" variant="outline" className="text-base border-secondary/30 text-secondary hover:bg-secondary/10">
                  View Agent Pipeline
                </Button>
              </Link>
            </div>
          </div>
          <div className="hidden lg:grid grid-cols-2 gap-4">
            {stats.map((stat, i) => (
              <div key={i} className="glass rounded-2xl p-6 text-center animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                <p className="text-3xl font-bold text-secondary">{stat.value}</p>
                <p className="text-sm mt-1" style={{ color: 'hsl(220, 20%, 70%)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Autonomous AI Agent System</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">6 specialized agents collaborate to process prior authorizations end-to-end — from document intake to final decision with explainable reasoning.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-background rounded-2xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <f.icon className="w-6 h-6 text-secondary-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-4">Why InsurCare AI?</h2>
            <p className="text-muted-foreground mb-8">Built for India's 500+ hospitals where 85% of prior authorizations are still manual. PA costs $41-55B annually — we're here to change that.</p>
            <ul className="space-y-4">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
                  <span className="text-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'MVP', time: '24 hours', desc: 'Hackathon proof of concept' },
              { title: 'Full Demo', time: '1 week', desc: 'All 6 agents live' },
              { title: 'Pilot', time: '1 month', desc: 'Single hospital deployment' },
              { title: 'Production', time: '3 months', desc: 'Multi-hospital enterprise' },
            ].map((t, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 shadow-card">
                <p className="text-sm font-medium text-secondary">{t.title}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{t.time}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 gradient-hero">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-4" style={{ color: 'white' }}>Ready to Transform Prior Authorization?</h2>
          <p className="text-lg mb-8" style={{ color: 'hsl(220, 20%, 75%)' }}>Join hospitals saving ₹50-80L per year with AI-powered PA decisions.</p>
          <Link to="/login">
            <Button size="lg" className="gradient-accent text-secondary-foreground border-0 text-base px-10">
              Get Started Now <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-card border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-secondary" />
            <span className="font-semibold text-foreground">InsurCare AI</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 Team HackNexus. Built for Cognizant Hackathon.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
