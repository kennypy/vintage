import { redirect } from 'next/navigation';

export default function AboutRedirectPage(): never {
  redirect('/sobre');
}
