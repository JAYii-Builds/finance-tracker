export default function Privacy() {
  return (
    <div style={{minHeight:"100vh",background:"#0f0f0f",color:"#e5e5e5",fontFamily:"'Inter',sans-serif",padding:"60px 24px"}}>
      <div style={{maxWidth:"720px",margin:"0 auto"}}>
        <h1 style={{fontSize:"28px",fontWeight:700,marginBottom:"8px"}}>Privacy Policy</h1>
        <p style={{color:"#666",fontSize:"13px",marginBottom:"40px"}}>Last updated: {new Date().toLocaleDateString()}</p>

        {[
          ["1. Information We Collect","We collect information you provide when creating an account (email address via Clerk authentication) and financial data you enter (transactions, amounts, categories, notes)."],
          ["2. How We Use Your Information","Your data is used solely to provide the Finance Tracker service to you. We use your email for account authentication only. We do not use your financial data for advertising or analytics."],
          ["3. Data Storage","Your financial data is stored in a secure PostgreSQL database. Authentication is handled by Clerk, which has its own privacy policy at clerk.com/privacy."],
          ["4. Data Sharing","We do not sell, trade, or share your personal or financial data with any third parties, except as required by law."],
          ["5. Data Security","We use industry-standard security measures including SSL encryption and secure database connections to protect your data."],
          ["6. Your Rights","You have the right to access, correct, or delete your data at any time. You can delete individual transactions from the dashboard or contact us to delete your entire account."],
          ["7. Cookies","We use only essential cookies required for authentication. We do not use tracking or advertising cookies."],
          ["8. Third-Party Services","We use Clerk for authentication and Neon for database hosting. Each has their own privacy policy governing their data handling."],
          ["9. Changes to This Policy","We may update this policy from time to time. We will notify users of significant changes via the app."],
          ["10. Contact","For privacy-related questions or data deletion requests, contact us through the app."],
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
