import { LegalPage, legalMetadata } from '@/components/LegalPage';

export const metadata = legalMetadata('delete-account');

export default function Page() {
  return <LegalPage doc="delete-account" />;
}
