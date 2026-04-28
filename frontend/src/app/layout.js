import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'MedicX - AI Radiology Diagnostic Suite',
  description: 'AI-powered chest X-ray analysis for disease detection and medical diagnosis support',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
