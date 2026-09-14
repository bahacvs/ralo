import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { MessageSquare, Send, User, ChevronRight } from 'lucide-react';

export const MessagesView: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMessages();
      setConversations(res.conversations);
      setMessages(res.messages);
      if (res.conversations.length > 0 && !activeConvId) {
        setActiveConvId(res.conversations[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Mesajlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvId || !newText.trim() || sending) return;

    setSending(true);
    try {
      const res = await api.sendMessage(activeConvId, newText.trim());
      setMessages(prev => [...prev, res.message]);
      setNewText('');
    } catch (err: any) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeMsgs = messages.filter(m => m.conversationId === activeConvId);

  if (loading) return <LoadingState message="Mesajlar yükleniyor..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
          Maç Sohbetleri ve Mesajlar
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Katıldığınız açık maçların oyuncularıyla iletişim kurun
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden min-h-[480px]">
        
        {/* Conversations List */}
        <div className="border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-3 py-2">
            Sohbetler ({conversations.length})
          </h2>
          <div className="space-y-1">
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full text-left p-3 rounded-2xl transition-all min-h-[44px] ${
                    isSelected ? 'bg-white shadow-xs border border-slate-200 text-slate-900' : 'hover:bg-slate-100/80 text-slate-700'
                  } focus-visible:ring-2 focus-visible:ring-amber-500`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold truncate text-slate-900">
                      {conv.reservationTitle || 'Açık Padel Maçı'}
                    </span>
                    <span className="text-[10px] text-slate-400">Bugün</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-1">
                    {conv.lastMessage || 'Henüz mesaj yok'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Thread */}
        <div className="md:col-span-2 flex flex-col justify-between p-4 sm:p-5 h-[480px]">
          {activeConv ? (
            <>
              {/* Thread Header */}
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeConv.reservationTitle || 'Maç Grubu Sohbeti'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    4 Katılımcı • Tüm yazışmalar gizli ve güvenlidir
                  </p>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {activeMsgs.map((msg) => {
                  const isMine = msg.senderUserId === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1 px-1">
                        <span>{isMine ? 'Sen' : msg.senderName}</span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`p-3 rounded-2xl max-w-[80%] text-xs leading-relaxed ${
                          isMine 
                            ? 'bg-amber-500 text-slate-950 font-medium rounded-br-none shadow-2xs' 
                            : 'bg-slate-100 text-slate-900 rounded-bl-none'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSend} className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <label htmlFor="msg-input" className="sr-only">Mesajınız</label>
                <input
                  id="msg-input"
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Mesajınızı yazın..."
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={!newText.trim() || sending}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 shadow-xs cursor-pointer"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">Gönder</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
              Bir sohbet seçin
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
