import type {Metadata} from 'next';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
export const metadata: Metadata = {title: 'OpenCacao | Supply Chain Terminal', description: 'Traceable cacao, forward escrow, and collateralized climate protection on Avalanche Fuji.'};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en" data-theme="dark"><body>{children}</body></html>;
}
