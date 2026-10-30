
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#101d3a">
<title>BD2026 | فرصت دیده‌شدن، حق همه است</title>
<meta name="description" content="BD2026؛ بستری برای معرفی محتوای ارزشمند، کشف فرصت‌های همکاری و رشد تولیدکنندگان محتوای فارسی‌زبان.">
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap');

:root {
  --navy:#101d3a;
  --blue:#2878f0;
  --light:#edf4ff;
  --text:#24324b;
  --muted:#718096;
  --white:#fff;
  --border:#e5eaf2;
  --green:#16a078;
  --shadow:0 12px 35px rgba(16,29,58,.08);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  font-family:'Vazirmatn',Tahoma,sans-serif;
  background:#f7f9fc;
  color:var(--text);
  line-height:1.8;
}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
a{text-decoration:none;color:inherit}
.container{width:min(1120px,92%);margin:auto}
header{
  background:rgba(255,255,255,.96);
  border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:20;
  backdrop-filter:blur(12px);
}
.nav{
  min-height:76px;
  display:flex;align-items:center;
  justify-content:space-between;gap:18px;
}
.brand{display:flex;align-items:center;gap:10px}
.logo{
  width:45px;height:45px;border-radius:14px;
  display:grid;place-items:center;
  color:white;font-weight:900;font-size:20px;
  background:linear-gradient(135deg,#2878f0,#10224a);
}
.brand-name{font-weight:900;color:var(--navy);font-size:20px}
.brand-name small{display:block;font-size:10px;color:var(--muted);font-weight:500}
.nav-links{display:flex;gap:24px;font-size:13px;font-weight:600}
.nav-links a:hover{color:var(--blue)}
.nav-actions{display:flex;gap:9px}
.btn{
  border:0;border-radius:12px;padding:11px 18px;
  font-weight:700;font-size:13px;
  transition:.2s;
}
.btn:hover{transform:translateY(-2px)}
.primary{background:var(--blue);color:white}
.secondary{background:var(--light);color:var(--blue)}
.dark{background:var(--navy);color:white}
.hero{
  padding:75px 0 60px;
  background:
  radial-gradient(circle at 10% 20%,#dceaff 0,transparent 30%),
  linear-gradient(135deg,#f5f8ff,#fff 60%,#edf4ff);
}
.hero-grid{
  display:grid;grid-template-columns:1.15fr .85fr;
  gap:45px;align-items:center;
}
.eyebrow{
  display:inline-block;padding:6px 13px;
  border-radius:30px;background:#e5efff;
  color:var(--blue);font-size:12px;font-weight:800;
}
h1{
  font-size:clamp(32px,5vw,53px);
  line-height:1.45;color:var(--navy);
  margin:18px 0;
}
h1 span{color:var(--blue)}
.hero p{color:var(--muted);font-size:16px;max-width:590px}
.hero-buttons{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.hero-visual{
  background:linear-gradient(145deg,#14264c,#234d8c);
  padding:30px;border-radius:28px;color:white;
  box-shadow:0 25px 55px rgba(16,29,58,.18);
  position:relative;overflow:hidden;
}
.hero-visual:after{
  content:"";position:absolute;width:220px;height:220px;
  border:1px solid #ffffff22;border-radius:50%;
  left:-80px;top:-100px;
}
.visual-title{font-size:21px;font-weight:800}
.visual-sub{font-size:12px;color:#c7d8f5}
.visual-card{
  background:#ffffff14;border:1px solid #ffffff25;
  padding:15px;border-radius:17px;margin-top:16px;
  display:flex;align-items:center;gap:12px;
}
.visual-icon{
  width:43px;height:43px;display:grid;place-items:center;
  border-radius:13px;background:#ffffff20;font-size:21px;
}
.visual-card strong{display:block;font-size:13px}
.visual-card small{color:#d3e1f7;font-size:11px}
.stats{
  display:grid;grid-template-columns:repeat(3,1fr);
  gap:12px;margin-top:22px;
}
.stat{
  background:#ffffff12;border-radius:13px;
  text-align:center;padding:12px 5px;
}
.stat strong{font-size:20px;display:block}
.stat span{font-size:10px;color:#d3e1f7}
section{padding:65px 0}
.section-head{text-align:center;margin-bottom:32px}
.section-head h2{font-size:27px;color:var(--navy);margin:0 0 8px}
.section-head p{color:var(--muted);font-size:13px;margin:0}
.path-grid{
  display:grid;grid-template-columns:repeat(3,1fr);gap:17px;
}
.path-card,.content-card,.opportunity,.feature{
  background:white;border:1px solid var(--border);
  border-radius:20px;padding:23px;
  box-shadow:var(--shadow);
}
.path-card{transition:.2s}
.path-card:hover{transform:translateY(-5px)}
.path-icon{
  width:52px;height:52px;border-radius:16px;
  background:var(--light);display:grid;place-items:center;
  font-size:24px;margin-bottom:14px;
}
.path-card h3{font-size:16px;color:var(--navy);margin:0 0 7px}
.path-card p{font-size:12px;color:var(--muted);min-height:48px}
.text-link{color:var(--blue);font-size:12px;font-weight:800}
.section-soft{background:#eff4fb}
.content-grid{
  display:grid;grid-template-columns:repeat(3,1fr);gap:17px;
}
.content-card{padding:0;overflow:hidden}
.content-cover{
  height:145px;display:grid;place-items:center;
  background:linear-gradient(135deg,#dceaff,#a9c9ff);
  font-size:44px;
}
.content-card:nth-child(2) .content-cover{
  background:linear-gradient(135deg,#e7ddff,#c4b4ff)
}
.content-card:nth-child(3) .content-cover{
  background:linear-gradient(135deg,#d8f5e9,#a9e5ce)
}
.content-body{padding:17px}
.tag{
  display:inline-block;background:#edf4ff;color:var(--blue);
  padding:4px 9px;border-radius:20px;font-size:10px;font-weight:700;
}
.content-body h3{font-size:15px;margin:10px 0 5px;color:var(--navy)}
.content-body p{font-size:12px;color:var(--muted);margin:0 0 13px}
.creator{font-size:11px;color:var(--muted)}
.opportunity-grid{
  display:grid;grid-template-columns:repeat(2,1fr);gap:16px;
}
.opportunity h3{font-size:16px;color:var(--navy);margin:10px 0 5px}
.opportunity p{font-size:12px;color:var(--muted)}
.opportunity-top{display:flex;justify-content:space-between;align-items:center}
.status{font-size:10px;color:var(--green);background:#e6f8f1;padding:5px 10px;border-radius:20px}
.features-grid{
  display:grid;grid-template-columns:repeat(4,1fr);gap:14px;
}
.feature{text-align:center;padding:20px 12px}
.feature div{font-size:27px}
.feature h3{font-size:13px;color:var(--navy)}
.feature p{font-size:11px;color:var(--muted)}
.cta{
  background:linear-gradient(120deg,#101d3a,#24569e);
  color:white;border-radius:25px;padding:38px;
  display:flex;align-items:center;justify-content:space-between;gap:20px;
}
.cta h2{margin:0 0 8px;font-size:24px}
.cta p{margin:0;color:#d4e1f5;font-size:12px}
footer{background:#101d3a;color:white;padding:35px 0;margin-top:65px}
.footer-inner{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
footer p,footer a{font-size:11px;color:#c2cde0}
footer strong{font-size:18px}
.modal{
  display:none;position:fixed;inset:0;z-index:50;
  background:#08152bd9;align-items:center;justify-content:center;
  padding:15px;
}
.modal.show{display:flex}
.modal-box{
  background:white;width:min(470px,100%);
  max-height:90vh;overflow:auto;
  border-radius:22px;padding:25px;position:relative;
}
.close{
  position:absolute;left:17px;top:12px;
  border:0;background:#edf2f8;border-radius:9px;
  width:32px;height:32px;font-size:20px;
}
.modal-box h2{font-size:20px;color:var(--navy);margin:0 0 5px}
.modal-box>p{font-size:12px;color:var(--muted);margin-top:0}
.field{margin:13px 0}
.field label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}
.field input,.field textarea,.field select{
  width:100%;border:1px solid var(--border);
  border-radius:11px;padding:11px;background:#fbfcff;
  outline:none;font-size:13px;
}
.field input:focus,.field textarea:focus{border-color:var(--blue)}
.field textarea{min-height:85px;resize:vertical}
.checks{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.checks label{font-size:11px;background:#f2f6fc;padding:8px;border-radius:9px}
.notice{
  background:#fff6df;color:#80601a;padding:10px;
  border-radius:10px;font-size:11px;margin:12px 0;
}
.message{font-size:12px;color:var(--green);margin-top:10px}
@media(max-width:800px){
  .nav-links{display:none}
  .hero-grid{grid-template-columns:1fr;gap:30px}
  .path-grid,.content-grid{grid-template-columns:1fr 1fr}
  .features-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:540px){
  .nav{min-height:66px}
  .brand-name{font-size:17px}
  .nav-actions .btn{padding:9px 11px;font-size:11px}
  .hero{padding:48px 0 40px}
  .hero-visual{padding:22px}
  section{padding:48px 0}
  .path-grid,.content-grid,.opportunity-grid{grid-template-columns:1fr}
  .path-card p{min-height:0}
  .cta{padding:25px;display:block}
  .cta .btn{margin-top:18px}
  .section-head h2{font-size:23px}
}
</style>
</head>
<body>

<header>
  <div class="container nav">
    <a class="brand" href="#">
      <div class="logo">BD</div>
      <div class="brand-name">BD2026<small>Business Development</small></div>
    </a>
    <nav class="nav-links">
      <a href="#paths">شروع فعالیت</a>
      <a href="#content">کشف محتوا</a>
      <a href="#opportunities">فرصت همکاری</a>
      <a href="#about">درباره ما</a>
    </nav>
    <div class="nav-actions">
      <button class="btn secondary" onclick="openModal('loginModal')">ورود</button>
      <button class="btn primary" onclick="openModal('registerModal')">عضویت</button>
    </div>
  </div>
</header>

<main>
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">پلتفرم رشد تولیدکنندگان محتوا</span>
        <h1>فرصت دیده‌شدن،<br><span>حق همه است.</span></h1>
        <p>
          محتوای ارزشمندت را معرفی کن، فرصت‌های همکاری را پیدا کن
          و استعدادت را به مسیر تازه‌ای از رشد تبدیل کن.
          در BD2026 کیفیت و خلاقیت اهمیت دارند.
        </p>
        <div class="hero-buttons">
          <button class="btn primary" onclick="openModal('submitModal')">معرفی محتوای من</button>
          <a class="btn secondary" href="#opportunities">پیدا کردن فرصت همکاری</a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="visual-title">آینده رشد، با همکاری ساخته می‌شود</div>
        <div class="visual-sub">یک مسیر تازه برای سازندگان محتوای فارسی</div>
        <div class="visual-card">
          <div class="visual-icon">🎬</div>
          <div><strong>معرفی محتوای مستقل</strong><small>هر ویدئو، یک فرصت تازه برای دیده‌شدن</small></div>
        </div>
        <div class="visual-card">
          <div class="visual-icon">🤝</div>
          <div><strong>همکاری حرفه‌ای</strong><small>ارتباط با افراد هم‌مسیر و هم‌علاقه</small></div>
        </div>
        <div class="visual-card">
          <div class="visual-icon">🚀</div>
          <div><strong>رشد و پیشرفت</strong><small>ساختن فرصت با کیفیت و خلاقیت</small></div>
        </div>
        <div class="stats">
          <div class="stat"><strong>۱</strong><span>محتوای مستقل</span></div>
          <div class="stat"><strong>۲</strong><span>همکاری واقعی</span></div>
          <div class="stat"><strong>۳</strong><span>رشد پایدار</span></div>
        </div>
      </div>
    </div>
  </section>

  <section id="paths">
    <div class="container">
      <div class="section-head">
        <h2>از کجا شروع کنیم؟</h2>
        <p>سه مسیر ساده برای ورود به دنیای BD2026</p>
      </div>
      <div class="path-grid">
        <div class="path-card">
          <div class="path-icon">🎥</div>
          <h3>معرفی محتوای من</h3>
          <p>لینک ویدئو یا پست خود را ثبت کن تا محتوایت در معرض کشف مخاطبان علاقه‌مند قرار بگیرد.</p>
          <button class="text-link" onclick="openModal('submitModal')">ثبت محتوا ←</button>
        </div>
        <div class="path-card">
          <div class="path-icon">🤝</div>
          <h3>پیدا کردن فرصت همکاری</h3>
          <p>پروژه‌ها و فرصت‌های همکاری را ببین و افراد هم‌مسیر خودت را پیدا کن.</p>
          <a class="text-link" href="#opportunities">مشاهده فرصت‌ها ←</a>
        </div>
        <div class="path-card">
          <div class="path-icon">👤</div>
          <h3>عضویت و اعتبار من</h3>
          <p>حساب خود را بساز، علایقت را انتخاب کن و مسیر حرفه‌ای خودت را شکل بده.</p>
          <button class="text-link" onclick="openModal('registerModal')">شروع عضویت ←</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section-soft" id="content">
    <div class="container">
      <div class="section-head">
        <h2>محتواهای قابل کشف</h2>
        <p>نمونه‌ای از دسته‌بندی محتواهای پلتفرم</p>
      </div>
      <div class="content-grid">
        <article class="content-card">
          <div class="content-cover">💻</div>
          <div class="content-body">
            <span class="tag">فناوری و آموزش</span>
            <h3>آشنایی با ابزارهای هوش مصنوعی</h3>
            <p>نمونه معرفی یک محتوای آموزشی و کاربردی.</p>
            <div class="creator">سازنده: نمونه کاربر</div>
          </div>
        </article>
        <article class="content-card">
          <div class="content-cover">🎨</div>
          <div class="content-body">
            <span class="tag">هنر و خلاقیت</span>
            <h3>مسیر خلق یک اثر هنری</h3>
            <p>نمونه‌ای برای نمایش محتوای خلاقانه.</p>
            <div class="creator">سازنده: نمونه کاربر</div>
          </div>
        </article>
        <article class="content-card">
          <div class="content-cover">🎮</div>
          <div class="content-body">
            <span class="tag">بازی و سرگرمی</span>
            <h3>تجربه‌ای تازه در دنیای بازی</h3>
            <p>نمونه‌ای از یک ویدئوی سرگرم‌کننده.</p>
            <div class="creator">سازنده: نمونه کاربر</div>
          </div>
        </article>
      </div>
      <p style="text-align:center;color:#718096;font-size:11px;margin-top:18px">
        این محتواها صرفاً نمونه نمایشی هستند و محتوای واقعی کاربران نیستند.
      </p>
    </div>
  </section>

  <section id="opportunities">
    <div class="container">
      <div class="section-head">
        <h2>فرصت‌های همکاری</h2>
        <p>رشد فقط دیده‌شدن نیست؛ گاهی یک همکاری خوب، شروع یک مسیر تازه است.</p>
      </div>
      <div class="opportunity-grid">
        <div class="opportunity">
          <div class="opportunity-top"><span class="tag">تولید محتوا</span><span class="status">نمونه آزمایشی</span></div>
          <h3>همکاری برای تولید محتوای آموزشی</h3>
          <p>همکاری با سازندگان علاقه‌مند به آموزش مهارت‌ها و موضوعات کاربردی.</p>
          <button class="text-link" onclick="openModal('opportunityModal')">ثبت درخواست همکاری ←</button>
        </div>
        <div class="opportunity">
          <div class="opportunity-top"><span class="tag">ایده‌پردازی</span><span class="status">نمونه آزمایشی</span></div>
          <h3>همکاری در پروژه‌های خلاقانه</h3>
          <p>پیدا کردن هم‌تیمی برای ایده‌های تازه در هنر، فناوری و سرگرمی.</p>
          <button class="text-link" onclick="openModal('opportunityModal')">ثبت درخواست همکاری ←</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section-soft" id="about">
    <div class="container">
      <div class="section-head">
        <h2>امکانات و مسیرهای BD2026</h2>
        <p>پلتفرمی برای رشد منصفانه و همکاری حرفه‌ای</p>
      </div>
      <div class="features-grid">
        <div class="feature"><div>📊</div><h3>داشبورد سازنده</h3><p>مدیریت فعالیت‌ها و محتوای ثبت‌شده</p></div>
        <div class="feature"><div>⭐</div><h3>اعتبار داخلی</h3><p>اعتبار برای امکانات مجاز داخل پلتفرم</p></div>
        <div class="feature"><div>💬</div><h3>ارتباط و گفتگو</h3><p>مسیر ارتباط حرفه‌ای میان اعضا</p></div>
        <div class="feature"><div>🌱</div><h3>رشد و یادگیری</h3><p>فرصت توسعه مهارت و تجربه</p></div>
      </div>
    </div>
  </section>

  <section>
    <div class="container">
      <div class="cta">
        <div>
          <h2>استعدادت را به فرصت تبدیل کن.</h2>
          <p>به جمع سازندگان محتوا بپیوند و مسیر رشد خودت را آغاز کن.</p>
        </div>
        <button class="btn primary" onclick="openModal('registerModal')">عضویت در BD2026</button>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="container footer-inner">
    <div>
      <strong>BD2026</strong>
      <p>فرصت دیده‌شدن، حق همه است.</p>
    </div>
    <div>
      <a href="#paths">شروع فعالیت</a> ·
      <a href="#content">کشف محتوا</a> ·
      <a href="#opportunities">فرصت همکاری</a>
      <p>© 2026 BD2026 - نسخه آزمایشی</p>
    </div>
  </div>
</footer>

<!-- فرم ورود نمایشی -->
<div class="modal" id="loginModal">
  <div class="modal-box">
    <button class="close" onclick="closeModal('loginModal')">×</button>
    <h2>ورود به BD2026</h2>
    <p>برای ورود، ایمیل خود را وارد کنید.</p>
    <form onsubmit="demoSubmit(event,'ورود در نسخه آزمایشی فعال نیست. پس از راه‌اندازی سرور، ورود ایمیلی اضافه می‌شود.')">
      <div class="field"><label>آدرس ایمیل</label><input type="email" required placeholder="name@example.com"></div>
      <button class="btn primary" type="submit" style="width:100%">ادامه</button>
      <div class="message"></div>
    </form>
    <div class="notice">ورود واقعی و ارسال کد تأیید هنوز به سرور متصل نشده است.</div>
  </div>
</div>

<!-- فرم عضویت -->
<div class="modal" id="registerModal">
  <div class="modal-box">
    <button class="close" onclick="closeModal('registerModal')">×</button>
    <h2>عضویت در BD2026</h2>
    <p>اطلاعات اولیه خود را وارد کنید.</p>
    <form onsubmit="saveDemo(event,'bd2026_members','عضویت نمایشی شما در همین مرورگر ذخیره شد.')">
      <div class="field"><label>نام نمایشی</label><input name="name" required placeholder="نام شما"></div>
      <div class="field"><label>ایمیل</label><input name="email" type="email" required placeholder="name@example.com"></div>
      <div class="field"><label>حوزه علاقه‌مندی</label>
        <select name="interest">
          <option>آموزش و مهارت</option><option>فناوری و هوش مصنوعی</option>
          <option>سرگرمی و طنز</option><option>بازی و گیمینگ</option>
          <option>موسیقی و هنر</option><option>کسب‌وکار و کارآفرینی</option>
          <option>ورزش و تناسب اندام</option><option>سفر و گردشگری</option>
          <option>آشپزی و غذا</option><option>علم و دانش</option>
        </select>
      </div>
      <button class="btn primary" type="submit" style="width:100%">ثبت اطلاعات آزمایشی</button>
      <div class="message"></div>
    </form>
    <div class="notice">این فرم فقط برای آزمایش ظاهر سایت است؛ حساب کاربری واقعی ایجاد نمی‌کند.</div>
  </div>
</div>

<!-- فرم معرفی محتوا -->
<div class="modal" id="submitModal">
  <div class="modal-box">
    <button class="close" onclick="closeModal('submitModal')">×</button>
    <h2>معرفی محتوای من</h2>
    <p>هر پست یا ویدئوی مستقل، یک فرصت تازه برای معرفی است.</p>
    <form onsubmit="saveDemo(event,'bd2026_posts','اطلاعات محتوای شما در این مرورگر ذخیره شد.')">
      <div class="field"><label>عنوان محتوا</label><input name="title" required placeholder="عنوان ویدئو یا پست"></div>
      <div class="field"><label>لینک مستقیم محتوا</label><input name="url" type="url" required placeholder="https://..."></div>
      <div class="field"><label>دسته‌بندی</label>
        <select name="category">
          <option>آموزش و مهارت</option><option>فناوری و هوش مصنوعی</option>
          <option>سرگرمی و طنز</option><option>بازی و گیمینگ</option>
          <option>موسیقی و هنر</option><option>فیلم و سینما</option>
          <option>ورزش و تناسب اندام</option><option>کسب‌وکار و کارآفرینی</option>
          <option>علم و دانش</option><option>سفر و گردشگری</option>
          <option>آشپزی و غذا</option><option>سبک زندگی</option>
        </select>
      </div>
      <div class="field"><label>توضیح کوتاه</label><textarea name="description" placeholder="درباره محتوای خود بنویسید"></textarea></div>
      <button class="btn primary" type="submit" style="width:100%">ثبت آزمایشی محتوا</button>
      <div class="message"></div>
    </form>
    <div class="notice">لطفاً فقط لینک مستقیم پست یا ویدئو را وارد کنید، نه لینک صفحه کانال.</div>
  </div>
</div>

<!-- فرم درخواست همکاری -->
<div class="modal" id="opportunityModal">
  <div class="modal-box">
    <button class="close" onclick="closeModal('opportunityModal')">×</button>
    <h2>درخواست همکاری</h2>
    <p>زمینه همکاری مورد علاقه خود را معرفی کنید.</p>
    <form onsubmit="saveDemo(event,'bd2026_collaborations','درخواست آزمایشی شما در همین مرورگر ذخیره شد.')">
      <div class="field"><label>نام نمایشی</label><input name="name" required placeholder="نام شما"></div>
      <div class="field"><label>ایمیل تماس</label><input name="email" type="email" required placeholder="name@example.com"></div>
      <div class="field"><label>زمینه همکاری</label>
        <select name="type"><option>تولید محتوای آموزشی</option><option>پروژه خلاقانه</option><option>تدوین و طراحی</option><option>ایده‌پردازی</option><option>همکاری تخصصی</option></select>
      </div>
      <div class="field"><label>توضیحات</label><textarea name="description" placeholder="چه نوع همکاری‌ای مدنظر دارید؟"></textarea></div>
      <button class="btn primary" type="submit" style="width:100%">ثبت درخواست آزمایشی</button>
      <div class="message"></div>
    </form>
    <div class="notice">این درخواست هنوز برای کاربران دیگر ارسال نمی‌شود و فقط در مرورگر شما ذخیره خواهد شد.</div>
  </div>
</div>

<script>
function openModal(id){
  document.getElementById(id).classList.add('show');
}
function closeModal(id){
  document.getElementById(id).classList.remove('show');
}
document.querySelectorAll('.modal').forEach(modal=>{
  modal.addEventListener('click',function(e){
    if(e.target===modal) modal.classList.remove('show');
  });
});
function saveDemo(event,key,message){
  event.preventDefault();
  const form=event.target;
  const data=Object.fromEntries(new FormData(form).entries());
  try{
    const old=JSON.parse(localStorage.getItem(key)||'[]');
    old.push({...data,createdAt:new Date().toISOString()});
    localStorage.setItem(key,JSON.stringify(old));
    form.querySelector('.message').textContent=message;
    form.reset();
  }catch(error){
    form.querySelector('.message').textContent='ذخیره‌سازی در این مرورگر ممکن نشد.';
  }
}
function demoSubmit(event,message){
  event.preventDefault();
  event.target.querySelector('.message').textContent=message;
}
</script>
</body>
</html>
