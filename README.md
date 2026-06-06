# FileConvert(벡터로)

순수 프론트엔드 기반의 이미지 · 벡터 파일 변환 웹앱입니다.  
서버 없이 브라우저에서 직접 파일을 변환하며, 변환 데이터는 외부로 전송되지 않습니다.

---

## 주요 기능

- **래스터 포맷 간 변환**: JPG, PNG, GIF, BMP, TIFF, TGA
- **벡터 변환**: 래스터 이미지 → SVG / AI (Adobe Illustrator 호환)
- **실시간 미리보기**: 포맷 선택 시 원본·변환 결과를 즉시 비교
- **해상도 선택**: 고해상도 / 저해상도 선택 옵션
- **벡터 옵션 슬라이더**: 선명도(Threshold), 디테일(Detail) 조절
- **드래그 앤 드롭** 파일 업로드 지원
- **완전 오프라인 동작**: 외부 서버 전송 없음

---

## 지원 포맷

| 입력 | 출력 |
|------|------|
| PNG, JPG, GIF, BMP, TIFF, TGA, SVG, AI | JPG, PNG, GIF, BMP, TIFF, TGA, SVG, AI |

---

## 사용 방법

1. 파일을 드래그하거나 **파일 선택** 버튼으로 업로드
2. 변환할 포맷 버튼 클릭 (미리보기 자동 표시)
3. 필요 시 해상도 및 벡터 옵션 조정
4. **변환하기** 버튼 클릭
5. 결과 화면에서 **다운로드** 클릭

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 언어 | HTML5, CSS3, Vanilla JavaScript |
| 벡터 트레이싱 | [ImageTracer.js](https://github.com/jankovicsandras/imagetracerjs) v1.2.6 |
| TIFF 인코딩 | [UTIF.js](https://github.com/photopea/UTIF.js) v3.1.0 |
| 아이콘 | [Lucide Icons](https://lucide.dev/) |
| Canvas API | BMP(24-bit), TGA(32-bit) 커스텀 인코더 포함 |

---

## 파일 구조

```
File_Converter/
├── index.html   # SPA 3-스크린 구조 (홈 / 옵션 / 결과)
├── style.css    # 다크 테마 스타일시트 (반응형)
├── app.js       # 변환 로직, 미리보기, UI 상태 관리
└── README.md
```

---

## 브라우저 지원

Chrome, Edge, Firefox, Safari (최신 버전 권장)  
모바일(iOS/Android) 브라우저에서도 동작합니다.

---

© Produced by You Seungoh · yso21@naver.com  
[youtube.com/@pianocanvas](https://youtube.com/@pianocanvas)
