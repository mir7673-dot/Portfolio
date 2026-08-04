# The C(9)atalog — 배포/운영 가이드 (GitHub + Supabase + Vercel)

기존 Netlify + CSV 파일 방식에서, **GitHub(버전관리) + Supabase(DB·이미지 저장소·로그인) + Vercel(호스팅)**
구조로 전환했습니다. `index.html`은 이제 `works.csv`/`cards.csv`를 읽지 않고, 항상 Supabase에서
실시간으로 데이터를 읽어옵니다. Admin 패널에서 하는 모든 수정(작품 추가/수정/삭제, 카드 추가/수정/삭제,
Info 수정, 레이아웃 드래그)은 **즉시 Supabase DB에 저장**되며, 예전처럼 "Export code → 코드에
붙여넣기 → 재배포"하는 과정이 없습니다.

## 폴더 구조

```
Portfolio/
  index.html          ← 사이트 본체 (Supabase에서 데이터를 읽고/씀)
  config.js           ← Supabase 프로젝트 URL + anon key (공개되어도 안전)
  supabase/schema.sql ← DB 테이블 + 보안규칙(RLS) + 이미지 버킷 정의 (최초 1회 실행)
  scripts/migrate.mjs ← cards.csv / works.csv + 로컬 이미지 → Supabase 일괄 동기화 스크립트
  cards.csv, works.csv, Cards/, Images/  ← 마이그레이션 스크립트의 "원본 데이터" (사이트가 직접 읽지 않음)
```

---

## 1. 최초 1회 설정

### 1-1. Supabase 프로젝트

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (이미 계정 있음).
2. 프로젝트 대시보드 → **SQL Editor** → New query → `supabase/schema.sql` 내용 전체 붙여넣고 실행.
   - `works`, `cards`, `site_info` 테이블 생성
   - 공개 읽기 / 로그인 사용자만 쓰기 가능하도록 RLS(Row Level Security) 설정
   - `works-images`, `cards-images` 스토리지 버킷 생성 (공개 읽기)
3. **Authentication → Users → Add user**로 Dylan의 관리자 계정을 이메일/비밀번호로 하나 생성.
   (이 계정이 곧 사이트의 Admin 로그인 계정입니다. 코드에 아이디/비번이 박혀있던 기존 방식과 달리
   Supabase가 직접 인증을 처리합니다.)
4. **Project Settings → API**에서 `Project URL`과 `anon public` key를 복사.

### 1-2. config.js에 연결 정보 입력

`config.js` 파일을 열어 아래 두 값을 채워주세요.

```js
window.SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...'; // anon public key
```

> anon key는 브라우저에 그대로 노출되어도 괜찮습니다. 실제 접근 권한은 anon key 자체가 아니라
> Supabase의 RLS 정책이 결정합니다 (읽기는 누구나, 쓰기는 로그인한 사용자만).
> 반면 `service_role` key(1-4 마이그레이션 단계에서 사용)는 RLS를 완전히 우회하는 마스터키이므로
> **절대 index.html이나 config.js, 커밋되는 어떤 파일에도 넣지 마세요.**

### 1-3. GitHub

```bash
git init
git add index.html config.js supabase works.csv cards.csv Cards Images package.json scripts README.md .gitignore
git commit -m "Initial commit: Supabase-backed portfolio"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

(`Cards`/`Images`/`works.csv`/`cards.csv`는 사이트가 직접 서빙하진 않지만, 다음에 대량 수정할 때
`npm run migrate`가 참조할 원본 데이터로 저장소에 같이 두는 걸 추천합니다.)

### 1-4. 기존 데이터 마이그레이션 (CSV + 로컬 이미지 → Supabase)

```bash
npm install
copy .env.example .env
```

`.env`를 열어 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`(Project Settings → API → `service_role`
secret key)를 채운 뒤:

```bash
npm run migrate
```

`Cards/`, `Images/` 폴더의 이미지를 Supabase Storage에 업로드하고, `cards.csv`/`works.csv`의
내용을 `cards`/`works` 테이블에 채워 넣습니다. 몇 번을 다시 실행해도 안전합니다 (카드 번호,
작품 slug 기준으로 기존 행을 덮어씀).

### 1-5. Vercel

1. Vercel 대시보드 → **Add New → Project** → 방금 만든 GitHub 저장소 선택.
2. Framework Preset: **Other** (빌드 과정이 없는 순수 정적 사이트). Build Command/Output Directory는
   비워두거나 기본값 그대로 두면 됩니다.
3. Deploy. 이후로는 `main` 브랜치에 push할 때마다 Vercel이 자동으로 재배포합니다.

---

## 2. 앞으로 cards / images를 업데이트하는 방법

두 가지 경로가 있고, 상황에 따라 골라 쓰면 됩니다.

### 방법 A — 사이트 Admin 패널에서 바로 (소량 수정에 적합)

배포된 사이트의 **Admin** 탭에서 Supabase 계정으로 로그인하면:
- **Archive — Layout Editor**: 작품 추가/수정/삭제, 이미지 업로드, 드래그로 위치 조정(자동 저장)
- **Archibook — Cards**: 카드 추가/수정/삭제, 이미지 업로드, 방문 여부 체크
- **Info — Edit**: 소개/수상/링크 등 수정

전부 저장 버튼을 누르는 즉시 Supabase DB·Storage에 반영되고, 새로고침만 하면 누구에게나 바로
보입니다. 배포나 재업로드가 필요 없습니다.

### 방법 B — 엑셀 + 폴더에 대량으로 넣고 스크립트로 동기화 (대량 수정에 적합)

157개 카드를 한 번에 넣었던 것처럼, 앞으로도 많은 양을 한꺼번에 넣을 땐 이 방법이 더 빠릅니다.

1. `cards.csv` 또는 `works.csv`를 엑셀에서 편집 (CSV UTF-8로 저장).
2. 새 이미지 파일을 `Cards/` 또는 `Images/` 폴더에 추가 (CSV의 `img` 컬럼 경로와 파일명이 일치해야 함).
3. 터미널에서:
   ```bash
   npm run migrate
   ```
   카드/작품 데이터와 새 이미지가 Supabase에 동기화됩니다. (기존에 Admin 패널에서 드래그로 잡아둔
   작품의 레이아웃 위치는 새로 만들 때만 자동 배치되고, 이미 있는 작품은 위치를 건드리지 않습니다.)
4. 필요하면 `git add cards.csv works.csv Cards Images && git commit && git push`로 원본 데이터도
   저장소에 함께 보관해두세요 (사이트 동작에는 영향 없고, 백업 및 재실행용 원본입니다).

---

## 3. 보안 메모

- `config.js`의 anon key: 공개되어도 안전. RLS가 실질적인 방어선.
- `.env`의 `service_role` key: 이 키를 가진 사람은 RLS를 무시하고 DB를 마음대로 읽고 쓸 수 있습니다.
  `.gitignore`에 이미 `.env`가 포함되어 있어 커밋되지 않지만, 실수로 다른 곳에 붙여넣지 않도록 주의.
- Admin 로그인 계정은 Supabase Authentication에서 관리되므로, 비밀번호를 바꾸고 싶으면 코드 수정 없이
  Supabase 대시보드(Authentication → Users)에서 바로 변경하면 됩니다.
