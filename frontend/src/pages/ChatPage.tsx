import { useState, useRef, useEffect } from 'react';
import { Send, Brain, User, Sparkles, Loader2, Zap } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const suggestedQuestions = [
  'What is the approval rate for Star Health this month?',
  'How does the patient risk score formula work?',
  'What documents are needed for a knee replacement PA?',
  'Explain how the 6-agent pipeline makes decisions',
];

async function callClaudeChat(messages: Message[]): Promise<string> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
  });
  if (!response.ok) throw new Error('API call failed');
  const data = await response.json();
  return data.reply || 'No response';
}

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const reply = await callClaudeChat(newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    }
    setLoading(false);
  };

  const renderMarkdown = (text: string) =>
    text
      .replace(/#{1,3} (.+)/g, '<h3 class="text-foreground font-semibold text-base mt-3 mb-1">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] animate-slide-up">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Assistant</h1>
            <p className="text-muted-foreground text-sm">Ask about PA requests, policy coverage, risk scores, and analytics.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200">
            <Zap className="w-3 h-3 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">AI Live</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mb-4 animate-float">
                <Sparkles className="w-8 h-8 text-secondary-foreground" />
              </div>
              <h3 className="font-semibold text-foreground text-lg mb-2">InsurCare AI Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">Ask about PA requests, policy coverage, risk scores, and how the 6-agent pipeline works.</p>
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                {suggestedQuestions.map((q, i) => (
                  <button key={i} onClick={() => send(q)}
                    className="text-left px-4 py-3 rounded-xl bg-card shadow-card hover:shadow-elevated transition-all text-sm text-foreground border border-border hover:border-secondary/30">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center shrink-0 mt-1">
                  <Brain className="w-4 h-4 text-secondary-foreground" />
                </div>
              )}
              <div className={`max-w-2xl rounded-2xl px-5 py-3 text-sm ${msg.role === 'user' ? 'gradient-primary text-primary-foreground' : 'bg-card shadow-card text-foreground border border-border'}`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-secondary-foreground" />
              </div>
              <div className="bg-card shadow-card rounded-2xl px-5 py-3 flex items-center gap-2 border border-border">
                <Loader2 className="w-4 h-4 text-secondary animate-spin" />
                <span className="text-sm text-muted-foreground">AI is thinking...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border pt-4">
          <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-3">
            <Input value={input} onChange={e => setInput(e.target.value)}
              placeholder="Ask about PA requests, policies, risk scores..."
              className="flex-1" disabled={loading} />
            <Button type="submit" disabled={!input.trim() || loading} className="gradient-accent text-secondary-foreground border-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;
