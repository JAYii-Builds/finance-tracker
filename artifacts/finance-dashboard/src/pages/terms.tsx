export default function Terms() {
  return (
    <div style={{minHeight:"100vh",background:"#0f0f0f",color:"#e5e5e5",fontFamily:"'Inter',sans-serif",padding:"60px 24px"}}>
      <div style={{maxWidth:"720px",margin:"0 auto"}}>
        <h1 style={{fontSize:"28px",fontWeight:700,marginBottom:"8px"}}>Terms of Service</h1>
        <p style={{color:"#666",fontSize:"13px",marginBottom:"40px"}}>Last updated: {new Date().toLocaleDateString()}</p>

        {[
          ["1. Acceptance of Terms","By accessing and using Finance Tracker, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use this service."],
          ["2. Use of Service","Finance Tracker is a personal finance management tool. You may use it only for lawful purposes and in accordance with these terms. You are responsible for maintaining the confidentiality of your account credentials."],
          ["3. Your Data","You own all financial data you enter into Finance Tracker. We store your data securely in our database and do not sell, share, or use it for any purpose other than providing the service to you."],
          ["4. Account Security","You are responsible for safeguarding your account. Notify us immediately of any unauthorized use. We are not liable for any loss resulting from unauthorized use of your account."],
          ["5. Prohibited Activities","You agree not to misuse the service, attempt to gain unauthorized access, upload malicious content, or use the service for any illegal purpose."],
          ["6. Disclaimer","Finance Tracker is provided for informational purposes only. It is not financial advice. Always consult a qualified financial advisor for financial decisions."],
          ["7. Limitation of Liability","Finance Tracker and its developers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service."],
          ["8. Changes to Terms","We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms."],
          ["9. Contact","For questions about these terms, contact us through the app."],
        ].map(([title,body])=>(
          <div key={title} style={{marginBottom:"28px"}}>
            <h2 style={{fontSize:"16px",fontWeight:600,marginBottom:"8px",color:"#e5e5e5"}}>{title}</h2>
            <p style={{fontSize:"14px",lineHeight:"1.7",color:"#aaa"}}>{body}</p>
          </div>
        ))}

        <a href="/" style={{color:"#10b981",fontSize:"13px",textDecoration:"none"}}>← Back to Finance Tracker</a>
      </div>
    </div>
  );
}
