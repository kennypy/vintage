'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiGet, apiPatch, apiPostForm } from '@/lib/api';

interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export default function EditarPerfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<Profile>('/users/me')
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setBio(p.bio ?? '');
        setPhone(p.phone ?? '');
        setAvatarUrl(p.avatarUrl ?? '');
      })
      .catch(() => router.push('/auth/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const flash = (type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      flash('error', 'Apenas JPEG ou PNG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      flash('error', 'Imagem maior que 10MB.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiPostForm<{ url: string; key: string }>('/uploads/avatar', form);
      setAvatarUrl(res.url);
      flash('success', 'Avatar enviado. Clique em Salvar para confirmar.');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Falha no upload.';
      flash('error', msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim()) {
      flash('error', 'O nome é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/users/${profile.id}`, {
        name: name.trim(),
        bio: bio.trim() || undefined,
        phone: phone.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      flash('success', 'Perfil atualizado.');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Não foi possível salvar.';
      flash('error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!profile) return null;

  const initial = (name || profile.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={`p-3 rounded-xl text-sm border ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {notice.msg}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-base font-semibold text-gray-900 mb-1">Editar perfil</h1>
        <p className="text-sm text-gray-500 mb-6">
          Estas informações aparecem na sua vitrine pública.
        </p>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={80}
                height={80}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xl font-semibold text-gray-500">{initial}</span>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFile}
              className="hidden"
              aria-label="Escolher nova foto"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              {uploading ? 'Enviando…' : 'Trocar foto'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="ml-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Remover
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Conte um pouco sobre você…"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{bio.length}/500</p>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/conta/configuracoes')}
              className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
