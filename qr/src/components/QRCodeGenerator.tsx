import { useState } from "react";
type ViewState = "input" | "result";
const QRCodeGenerator = () => {
  const [url, setUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [view, setView] = useState<ViewState>("input");
  const generateQR = () => {
    if (!url.trim()) return;

    // Using goqr.me free API - no dependencies needed
    const encoded = encodeURIComponent(url.trim());
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}&margin=10`;
    setQrUrl(qrApiUrl);
    setView("result");
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      generateQR();
    }
  };
  const reset = () => {
    setUrl("");
    setQrUrl("");
    setView("input");
  };
  return <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {view === "input" ? <div className="fade-in bg-card rounded-lg shadow-card p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-primary/10 mb-4">
                <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-foreground">Create code</h1>
              <p className="text-muted-foreground mt-2">
                Paste payment URL.
              </p>
            </div>

            <div className="space-y-4">
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={handleKeyDown} placeholder="https://example.com" className="w-full px-4 py-3.5 rounded-lg border border-border bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              <button onClick={generateQR} disabled={!url.trim()} className="w-full py-3.5 px-6 rounded-lg font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 bg-black text-white disabled:bg-[#C2C2C2] disabled:text-white">
                Generate QR Code
              </button>
            </div>
          </div> : <div className="fade-in bg-card rounded-lg shadow-card p-8">
            <div className="text-center">
              <div className="bg-white p-4 rounded-lg inline-block shadow-soft">
                <img src={qrUrl} alt="Generated QR Code" className="w-[280px] h-[280px]" />
              </div>
            </div>
          </div>}
      </div>

      {view === "result" && <button onClick={reset} className="fade-in mt-6 inline-flex items-center gap-2 text-[#F7F7F7] font-medium hover:opacity-80 transition-opacity">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h-1M5 12H4m14.364-5.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
          </svg>
          Create another QR code
        </button>}
    </div>;
};
export default QRCodeGenerator;