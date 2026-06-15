# Indie Art Lab - 아트 프로토타이핑 보조 도구 🎨

본 프로젝트는 캐릭터 일러스트레이터와 아트 디자이너를 위한 **스마트 색상 보조 및 프로토타이핑 웹 애플리케이션**입니다. 메인 컬러를 기반으로 조화로운 색상을 추천받고, 캐릭터 특화 배색을 제안받거나, 나만의 커스텀 팔레트를 구성하여 작업 효율을 높일 수 있습니다.

> **기말 제출물 평가를 위한 가이드:** 본 Readme 문서는 실제 코드 실행 및 평가를 원활하게 진행하기 위해 작성되었습니다. 아래의 **[🚀 코드 실행 방법]**을 참고하여 프로젝트를 실행해 주시기 바랍니다.

---

## 🚀 코드 실행 방법 (How to Run)

본 프로젝트는 별도의 복잡한 빌드 과정(Webpack, Node.js 서버 등) 없이, 순수 HTML/CSS/JavaScript로 구성된 정적(Static) 웹 페이지입니다. 다음 두 가지 방법 중 하나를 선택하여 실행할 수 있습니다.

### 방법 1: 로컬 웹 서버를 통한 실행 (⭐ 권장)
브라우저의 보안 정책(CORS 등)으로 인해 로컬 파일(`file://`)을 직접 열었을 때 일부 JavaScript 기능이나 폰트/아이콘이 정상적으로 로드되지 않을 수 있습니다. 따라서 **로컬 웹 서버를 띄워 실행하는 것을 강력히 권장**합니다.

*   **VS Code 사용자 (가장 쉬운 방법):**
    1. VS Code에서 `color_assistant` 폴더를 엽니다.
    2. 확장 프로그램(Extensions) 탭에서 **Live Server**를 검색하여 설치합니다.
    3. `index.html` 파일을 우클릭하고 **"Open with Live Server"**를 클릭합니다.
    4. 자동으로 기본 브라우저가 열리며 `http://127.0.0.0:5500` 주소에서 프로젝트가 실행됩니다.

*   **Python이 설치된 환경:**
    1. 터미널(또는 명령 프롬프트)을 열고 `color_assistant` 폴더로 이동합니다.
    2. 아래 명령어를 입력하여 내장 웹 서버를 실행합니다.
       * Python 3.x: `python -m http.server 8000`
    3. 브라우저를 열고 `http://localhost:8000` 으로 접속합니다.

### 방법 2: 브라우저에서 직접 파일 열기
웹 서버 환경을 구축하기 어렵다면 파일을 직접 실행할 수 있습니다.
1. 다운로드 받은 `color_assistant` 폴더를 엽니다.
2. 폴더 내의 **`index.html`** 파일을 더블 클릭하여 웹 브라우저(Chrome, Edge, Safari 등)로 실행합니다.

---

## 📌 주요 기능 (Features)

좌측의 **사이드바 메뉴(☰)**를 열어 각 기능 페이지로 이동할 수 있습니다.

1.  **메인 허브 (`index.html`)**
    *   프로젝트의 전체 개요와 각 기능에 대한 설명을 확인할 수 있는 홈 화면입니다.
2.  **색상 대체 (`color-replace.html`)**
    *   핵심 색상을 추출하여, 원하는 팔레트에서 불러온 새로운 색상으로 빠르게 교체 및 테스트해 볼 수 있는 기능입니다.
3.  **커스텀 팔레트 (`custom-palette.html`)**
    *   작업에 필요한 색상들을 직접 조합하여 나만의 팔레트를 만들고 관리할 수 있습니다.
4.  **스마트 색상 추천 (`color-assistant.html`)**
    *   지정된 메인 컬러를 기반으로 조화, 블렌딩, 보색 등 다양한 알고리즘을 통해 최적의 색상 팔레트를 지능적으로 추천합니다.
5.  **캐릭터 특화 맞춤 배색 (`color-assistant-character.html`)**
    *   피부톤 융화, 이너/아우터 명도 대비 등 캐릭터 일러스트에 완벽하게 특화된 맞춤형 배색을 제안합니다.

---

## 📂 파일 구조 (Directory Structure)

```text
color_assistant/
│
├── index.html                  # 메인 홈 화면 (진입점)
├── color-assistant.html        # 스마트 색상 추천 기능 페이지
├── color-assistant-character.html # 캐릭터 특화 배색 페이지
├── color-replace.html          # 색상 대체 기능 페이지
├── custom-palette.html         # 커스텀 팔레트 페이지
├── launch-feedback.html        # 피드백 및 알림 페이지
│
├── assets/                     # 정적 자원 폴더
│   ├── css/                    # 스타일시트 (main.css, site.css 등)
│   ├── js/                     # 자바스크립트 로직 (main.js, util.js 등)
│   ├── webfonts/               # 아이콘 폰트 파일
│   └── sass/                   # SASS 소스 파일 (수정 시 사용)
│
├── images/                     # 데모 및 UI 이미지 폴더
└── Readme.md                   # 프로젝트 실행 및 설명 문서 (현재 파일)
```

---

## 🛠 사용 기술 및 크레딧 (Credits)

*   **Front-end:** HTML5, CSS3, Vanilla JavaScript
*   **Design Template:** [HTML5 UP - Editorial](https://html5up.net/) (CCA 3.0 License)
*   **Icons:** Font Awesome
*   **Library:** jQuery (일부 UI 토글 및 애니메이션 처리에 사용)
