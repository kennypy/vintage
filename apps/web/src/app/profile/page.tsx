'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiGet, apiPost, apiPut, apiDelete, clearAuthToken } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  verified?: boolean;
  cpf?: string;
}

interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault: boolean;
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const navItems = [
  { key: 'perfil', label: 'Perfil', icon: '👤' },
  { key: 'conta', label: 'Conta', icon: '⚙️' },
  { key: 'pagamentos', label: 'Pagamentos', icon: '💳' },
  { key: 'postagem', label: 'Postagem', icon: '📦' },
  { key: 'seguranca', label: 'Segurança', icon: '🔒' },
  { key: 'notificacoes', label: 'Notificações', icon: '🔔' },
  { key: 'idioma', label: 'Idioma', icon: '🌐' },
  { key: 'aparencia', label: 'Aparência', icon: '🌙' },
  { key: 'privacidade', label: 'Privacidade', icon: '🛡️' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('perfil');
  const [saved, setSaved] = useState(false);

  // Profile section state
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [showCity, setShowCity] = useState(true);

  // Account section state
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [birthday, setBirthday] = useState('');
  const [cpf, setCpf] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Payments state
  const [paymentMethods] = useState([
    { id: '1', type: 'PIX', detail: 'Chave CPF', isDefault: true },
  ]);

  // Addresses state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState<Omit<Address, 'id' | 'isDefault'>>({
    label: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: '',
  });

  // Security state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification state
  const [notif, setNotif] = useState({
    pushEnabled: true,
    emailEnabled: true,
    orders: true,
    messages: true,
    offers: true,
    followers: true,
    priceDrops: true,
    promotions: false,
    news: false,
  });

  // Language
  const [language, setLanguage] = useState('pt-BR');

  // Dark mode
  const [darkMode, setDarkMode] = useState<'off' | 'on' | 'system'>('system');

  // Privacy
  const [privacy, setPrivacy] = useState({
    thirdPartyTracking: false,
    personalisedContent: true,
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<UserProfile>('/users/me')
      .then((data) => {
        setUser(data);
        setUsername(data.name ?? '');
        setFullName(data.name ?? '');
        setBio(data.bio ?? '');
        setPhoneNumber(data.phone ?? '');
        setCpf(data.cpf ?? '');
      })
      .catch(() => {
        clearAuthToken();
        router.push('/auth/login');
      })
      .finally(() => setLoading(false));

    apiGet<Address[]>('/users/me/addresses')
      .then((data) => setAddresses(Array.isArray(data) ? data : []))
      .catch(() => setAddresses([]));
  }, [router]);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      await apiPut(`/users/${user.id}`, { name: username, bio });
      showSaved();
    } catch {
      // silently fail in UI — field stays editable
    }
  };

  const handleSaveAccount = async () => {
    if (!user) return;
    try {
      await apiPut(`/users/${user.id}`, { name: fullName, phone: phoneNumber });
      showSaved();
    } catch {
      // silently fail
    }
  };

  const handleAddAddress = async () => {
    try {
      const created = await apiPost<Address>('/users/me/addresses', {
        ...newAddress,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, created]);
      setShowAddressForm(false);
      setNewAddress({ label: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', cep: '' });
    } catch {
      // silently fail
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    try {
      await apiDelete(`/users/me/addresses/${addressId}`);
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
    } catch {
      // silently fail
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    router.push('/');
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.')) {
      clearAuthToken();
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-xl">
            {user.avatarUrl ? (
              <Image src={user.avatarUrl} alt={user.name} width={56} height={56} className="rounded-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{user.name}</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-700 transition">
          Sair
        </button>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Alterações salvas com sucesso.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Sidebar nav */}
        <nav className="sm:w-52 flex-shrink-0">
          <ul className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {navItems.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition border-b border-gray-100 last:border-0 ${
                    activeSection === item.key
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── Perfil ── */}
          {activeSection === 'perfil' && (
            <div>
              <Section title="Detalhes do Perfil">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome de utilizador</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Escolha um nome de utilizador"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Pode ser o seu nome ou e-mail.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sobre mim</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                      placeholder="Conte um pouco sobre você..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Localização</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex: São Paulo, SP"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <Row label="Mostrar cidade no perfil" hint="Outros usuários poderão ver sua cidade">
                    <Toggle value={showCity} onChange={setShowCity} />
                  </Row>
                </div>
                <button
                  onClick={handleSaveProfile}
                  className="mt-4 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition"
                >
                  Guardar alterações
                </button>
              </Section>
            </div>
          )}

          {/* ── Conta ── */}
          {activeSection === 'conta' && (
            <div>
              <Section title="Definições de Conta">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Género</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    >
                      <option value="">Prefiro não dizer</option>
                      <option value="feminino">Feminino</option>
                      <option value="masculino">Masculino</option>
                      <option value="nao-binario">Não-binário</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de nascimento</label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                    <input
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Necessário para saques e notas fiscais.</p>
                  </div>
                </div>
                <button
                  onClick={handleSaveAccount}
                  className="mt-4 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition"
                >
                  Guardar alterações
                </button>
              </Section>

              <Section title="Verificações">
                <Row label="Verificar e-mail" hint={user.verified ? 'E-mail verificado' : 'E-mail não verificado'}>
                  {user.verified ? (
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">Verificado</span>
                  ) : (
                    <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Verificar</button>
                  )}
                </Row>
                <Row label="Número de telemóvel" hint={phoneNumber || 'Não adicionado'}>
                  <div className="flex items-center gap-2">
                    <input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+55 11 99999-9999"
                      className="w-40 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">Verificar</button>
                  </div>
                </Row>
              </Section>

              <Section title="Contas ligadas">
                <Row label="Facebook" hint="Não ligado">
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ligar</button>
                </Row>
                <Row label="Google" hint="Não ligado">
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ligar</button>
                </Row>
                <Row label="WhatsApp" hint="Não ligado">
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ligar</button>
                </Row>
              </Section>

              <Section title="Zona de perigo">
                <button
                  onClick={handleDeleteAccount}
                  className="w-full py-2.5 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition"
                >
                  Eliminar minha conta
                </button>
                <p className="text-xs text-gray-400 mt-2">Esta ação é permanente e não pode ser revertida.</p>
              </Section>
            </div>
          )}

          {/* ── Pagamentos ── */}
          {activeSection === 'pagamentos' && (
            <div>
              <Section title="Métodos de Pagamento">
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">Nenhum método adicionado.</p>
                ) : (
                  <ul className="space-y-3 mb-4">
                    {paymentMethods.map((pm) => (
                      <li key={pm.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{pm.type}</p>
                          <p className="text-xs text-gray-500">{pm.detail}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {pm.isDefault && (
                            <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">Padrão</span>
                          )}
                          {!pm.isDefault && (
                            <button className="text-xs text-gray-500 hover:text-brand-600">Definir padrão</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-brand-400 hover:text-brand-600 transition">
                  + Adicionar método de pagamento
                </button>
              </Section>

              <Section title="Chave PIX">
                <Row label="CPF como chave PIX" hint="Use seu CPF para receber pagamentos">
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Configurar</button>
                </Row>
                <Row label="E-mail como chave PIX" hint={user.email}>
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Configurar</button>
                </Row>
              </Section>
            </div>
          )}

          {/* ── Postagem ── */}
          {activeSection === 'postagem' && (
            <div>
              <Section title="Endereços de Envio">
                {addresses.length === 0 && !showAddressForm && (
                  <p className="text-sm text-gray-500 py-2">Nenhum endereço adicionado.</p>
                )}
                {addresses.map((addr) => (
                  <div key={addr.id} className="flex items-start justify-between p-3 border border-gray-200 rounded-lg mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-800">{addr.label}</p>
                        {addr.isDefault && (
                          <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">Padrão</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{addr.street}, {addr.number}{addr.complement ? ` — ${addr.complement}` : ''}</p>
                      <p className="text-xs text-gray-500">{addr.neighborhood}, {addr.city} — {addr.state}</p>
                      <p className="text-xs text-gray-500">CEP: {addr.cep}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-xs text-red-500 hover:text-red-700 ml-4"
                    >
                      Remover
                    </button>
                  </div>
                ))}

                {showAddressForm && (
                  <div className="border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
                    <h3 className="text-sm font-medium text-gray-700">Novo endereço</h3>
                    <input
                      placeholder="Identificação (ex: Casa, Trabalho)"
                      value={newAddress.label}
                      onChange={(e) => setNewAddress((p) => ({ ...p, label: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        placeholder="CEP"
                        value={newAddress.cep}
                        onChange={(e) => setNewAddress((p) => ({ ...p, cep: e.target.value }))}
                        className="col-span-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        placeholder="Rua / Av."
                        value={newAddress.street}
                        onChange={(e) => setNewAddress((p) => ({ ...p, street: e.target.value }))}
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Número"
                        value={newAddress.number}
                        onChange={(e) => setNewAddress((p) => ({ ...p, number: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        placeholder="Complemento"
                        value={newAddress.complement}
                        onChange={(e) => setNewAddress((p) => ({ ...p, complement: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                    <input
                      placeholder="Bairro"
                      value={newAddress.neighborhood}
                      onChange={(e) => setNewAddress((p) => ({ ...p, neighborhood: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Cidade"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress((p) => ({ ...p, city: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <select
                        value={newAddress.state}
                        onChange={(e) => setNewAddress((p) => ({ ...p, state: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                      >
                        <option value="">Estado</option>
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddAddress}
                        className="flex-1 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition"
                      >
                        Guardar endereço
                      </button>
                      <button
                        onClick={() => setShowAddressForm(false)}
                        className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {!showAddressForm && (
                  <button
                    onClick={() => setShowAddressForm(true)}
                    className="w-full py-2.5 border-2 border-dashed border-gray-300 text-sm text-gray-500 rounded-lg hover:border-brand-400 hover:text-brand-600 transition"
                  >
                    + Adicionar endereço
                  </button>
                )}
              </Section>
            </div>
          )}

          {/* ── Segurança ── */}
          {activeSection === 'seguranca' && (
            <div>
              <Section title="Atualizar E-mail">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Novo e-mail</label>
                    <input
                      type="email"
                      placeholder={user.email}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <button className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition">
                    Atualizar e-mail
                  </button>
                </div>
              </Section>

              <Section title="Alterar Senha">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}
                    className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition disabled:opacity-40"
                  >
                    Atualizar senha
                  </button>
                </div>
              </Section>

              <Section title="Verificação em 2 Etapas">
                <Row label="Autenticação em 2 fatores" hint={twoFAEnabled ? 'Ativada via app de autenticação' : 'Adiciona uma camada extra de segurança'}>
                  <Toggle value={twoFAEnabled} onChange={setTwoFAEnabled} />
                </Row>
                {twoFAEnabled && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">
                      Use Google Authenticator ou Authy para escanear o QR code ao ativar.
                    </p>
                  </div>
                )}
              </Section>

              <Section title="Dispositivos com Sessão Aberta">
                <div className="space-y-2">
                  {[
                    { name: 'Chrome — São Paulo, Brasil', current: true, lastSeen: 'Agora' },
                    { name: 'Safari — iPhone', current: false, lastSeen: 'Ontem, 14:32' },
                  ].map((device, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{device.name}</p>
                        <p className="text-xs text-gray-400">{device.current ? 'Sessão atual' : `Visto por último: ${device.lastSeen}`}</p>
                      </div>
                      {!device.current && (
                        <button className="text-xs text-red-500 hover:text-red-700">Encerrar</button>
                      )}
                      {device.current && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Atual</span>
                      )}
                    </div>
                  ))}
                </div>
                <button className="mt-3 text-sm text-red-500 hover:text-red-700">
                  Encerrar todas as outras sessões
                </button>
              </Section>
            </div>
          )}

          {/* ── Notificações ── */}
          {activeSection === 'notificacoes' && (
            <div>
              <Section title="Canais de Notificação">
                <Row label="Notificações push" hint="No telemóvel e browser">
                  <Toggle value={notif.pushEnabled} onChange={(v) => setNotif((p) => ({ ...p, pushEnabled: v }))} />
                </Row>
                <Row label="Notificações por e-mail" hint={user.email}>
                  <Toggle value={notif.emailEnabled} onChange={(v) => setNotif((p) => ({ ...p, emailEnabled: v }))} />
                </Row>
              </Section>

              <Section title="Categorias de Notificação">
                <Row label="Encomendas" hint="Atualizações de pagamento, envio e entrega">
                  <Toggle value={notif.orders} onChange={(v) => setNotif((p) => ({ ...p, orders: v }))} />
                </Row>
                <Row label="Mensagens" hint="Novas mensagens de compradores e vendedores">
                  <Toggle value={notif.messages} onChange={(v) => setNotif((p) => ({ ...p, messages: v }))} />
                </Row>
                <Row label="Ofertas" hint="Propostas recebidas e respostas">
                  <Toggle value={notif.offers} onChange={(v) => setNotif((p) => ({ ...p, offers: v }))} />
                </Row>
                <Row label="Novos seguidores" hint="Quando alguém começa a seguir você">
                  <Toggle value={notif.followers} onChange={(v) => setNotif((p) => ({ ...p, followers: v }))} />
                </Row>
                <Row label="Baixa de preço" hint="Artigos favoritos com preço reduzido">
                  <Toggle value={notif.priceDrops} onChange={(v) => setNotif((p) => ({ ...p, priceDrops: v }))} />
                </Row>
                <Row label="Promoções" hint="Destaque, Bump e ofertas especiais">
                  <Toggle value={notif.promotions} onChange={(v) => setNotif((p) => ({ ...p, promotions: v }))} />
                </Row>
                <Row label="Novidades do Vintage.br" hint="Atualizações da plataforma e dicas">
                  <Toggle value={notif.news} onChange={(v) => setNotif((p) => ({ ...p, news: v }))} />
                </Row>
              </Section>
            </div>
          )}

          {/* ── Idioma ── */}
          {activeSection === 'idioma' && (
            <div>
              <Section title="Idioma">
                <p className="text-sm text-gray-500 mb-4">Selecione o idioma da interface.</p>
                <div className="space-y-2">
                  {[
                    { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
                    { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`w-full flex items-center gap-3 p-3 border rounded-lg text-left transition ${
                        language === lang.code
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-sm font-medium text-gray-800">{lang.label}</span>
                      {language === lang.code && (
                        <span className="ml-auto text-brand-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ── Aparência ── */}
          {activeSection === 'aparencia' && (
            <div>
              <Section title="Modo Escuro">
                <p className="text-sm text-gray-500 mb-4">Escolha o tema da aplicação.</p>
                <div className="space-y-2">
                  {[
                    { key: 'off', label: 'Claro', icon: '☀️', desc: 'Sempre usar tema claro' },
                    { key: 'on', label: 'Escuro', icon: '🌙', desc: 'Sempre usar tema escuro' },
                    { key: 'system', label: 'Sistema', icon: '💻', desc: 'Seguir as definições do dispositivo' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setDarkMode(opt.key as 'off' | 'on' | 'system')}
                      className={`w-full flex items-center gap-3 p-3 border rounded-lg text-left transition ${
                        darkMode === opt.key
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.desc}</p>
                      </div>
                      {darkMode === opt.key && (
                        <span className="ml-auto text-brand-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ── Privacidade ── */}
          {activeSection === 'privacidade' && (
            <div>
              <Section title="Definições de Privacidade">
                <Row
                  label="Rastreamento por terceiros"
                  hint="Permite que parceiros recolham dados para análise e publicidade"
                >
                  <Toggle
                    value={privacy.thirdPartyTracking}
                    onChange={(v) => setPrivacy((p) => ({ ...p, thirdPartyTracking: v }))}
                  />
                </Row>
                <Row
                  label="Conteúdo personalizado"
                  hint="Mostra sugestões baseadas nas suas pesquisas e favoritos"
                >
                  <Toggle
                    value={privacy.personalisedContent}
                    onChange={(v) => setPrivacy((p) => ({ ...p, personalisedContent: v }))}
                  />
                </Row>
              </Section>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700">
                  Ao usar o Vintage.br, você concorda com a nossa{' '}
                  <a href="#" className="underline font-medium">Política de Privacidade</a>
                  {' '}e os nossos{' '}
                  <a href="#" className="underline font-medium">Termos de Serviço</a>.
                  Os seus dados nunca são vendidos a terceiros.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
