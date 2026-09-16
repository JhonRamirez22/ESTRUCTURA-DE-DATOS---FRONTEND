import Link from 'next/link';
import { Tx } from '@/lib/preferences';
import AppShell from '@/components/AppShell';
import InterfaceIcon from '@/components/InterfaceIcon';

export default function Home() {
  return (
    <AppShell active="home">
      <main className="rp-home">
        <section className="rp-home-intro">
          <div>
            <h1><Tx k="home.title" /></h1>
            <p className="rp-home-lead">
              <Tx k="home.lead" />
            </p>
            <div className="rp-access-meta"><InterfaceIcon name="locate" /><span><Tx k="home.area" /></span></div>
          </div>
          <section className="rp-home-actions" aria-labelledby="home-actions-title">
            <h2 id="home-actions-title"><Tx k="home.question" /></h2>
            <Link className="rp-entry-link" href="/acceso">
              <InterfaceIcon name="route" />
              <span><strong><Tx k="home.staff" /></strong><p><Tx k="home.staff.meta" /></p></span>
              <InterfaceIcon name="arrow" className="rp-entry-arrow" />
            </Link>
            <Link className="rp-entry-link" href="/solicitar">
