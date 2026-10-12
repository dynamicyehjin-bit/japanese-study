# 한자 사전 보완 출처와 추출 기준

2026-10-12 기준 앱의 기본·교재 데이터에 포함된 227글자를 대조했다. 일본어 독음과 한국 훈음을 추측하거나 영문 의미에서 번역하지 않았다. 자동 보완은 이미 등록된 한자 레코드의 빈 필드만 채운다. 입력된 비어 있지 않은 사용자 정보는 보존하며 사전과 다르면 `partially_verified` 상태로 구분한다. 학습 기록, 통계, 오답, 즐겨찾기 및 단어 읽기/뜻은 변경하지 않는다.

## 일본어: KANJIDIC2

- 원저자/관리: Electronic Dictionary Research and Development Group (EDRDG)
- 원본 프로젝트: https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
- 배포 변환본: https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20261005200550
- 사전 기준일: 2026-10-05, 변환본 버전 3.6.2
- `readingMeaning.groups[].readings`의 `ja_on`, `ja_kun`만 사용한다. 중국어/한국어 독음 또는 `nanori`(인명 독음)를 일본어 음독·훈독으로 변환하지 않는다.
- 오쿠리가나 경계 `.`와 접사 표기 `-`를 원본대로 유지한다.
- 227개 모두 음독이 등재되어 있고 193개에 훈독이 등재되어 있다. 나머지 34개는 이 사전에 훈독이 등재되지 않아 빈 배열로 보관하고 UI에서 ‘사전 등재 없음’을 표시한다. 이를 ‘일본어에 훈독이 절대 없음’으로 해석하지 않는다.
- 추출/형식 변환한 일본어 독음 데이터는 **Creative Commons Attribution-ShareAlike 4.0** 조건을 따른다: https://creativecommons.org/licenses/by-sa/4.0/ . EDRDG를 표시하고 수정·추출 사실과 배포본을 명시했다. 같은 독음 데이터를 재배포할 때 이 출처와 라이선스를 유지해야 한다. 앱 코드 전체에 이 데이터 라이선스를 적용하는 것은 아니다.

## 한국 훈음: 한국어문회 선정한자 자료

- 원자료: 사단법인 한국어문회 https://www.hanja.re.kr/
- 사용 자료: 한국어문회 공식 학습자료 XLS를 CSV로 변환한 `rycont/hanja-grade-dataset`의 `hanja.csv`
- 고정 커밋: `91a1f49c7f05492f76ce817096b3fb500830f7b9`
- 출처/변환 설명: https://github.com/rycont/hanja-grade-dataset
- 한국어 훈과 음은 `meaning` 필드의 실제 훈·음 쌍에서 추출한다. 동일 글자의 여러 훈음을 쌍으로 보관한다. 대표 훈음은 원자료의 `main_sound`에 대응하는 쌍을 선택한다.
- 괄호 안 관련 한자 주석은 독음 자체가 아니므로 표시용 독음에서 분리한다. 예: `획(劃)` → `획`. 원문은 증거 파일에 그대로 보관한다.
- 한국어문회 원자료의 저작권 표시는 원 출처 README를 따른다. 이 자료를 KANJIDIC2의 CC 라이선스로 재분류하지 않는다.

## 일본식 자형 대응

- 자료: CJKVI `joyo-variants.txt`, `jp-old-style.txt`
- 고정 커밋: `e4f1da248c9737a243f9930b5dc497cef5d5ae16`
- 출처: https://github.com/cjkvi/cjkvi-variants
- 한국어문회 자료에서 직접 대조되는 191글자와 일본식 신자체에 대응하는 한국 한자 36글자를 구분한다. `学 → 學`, `駅 → 驛`, `営 → 營` 등은 대응표의 명시적 연결을 사용한다.
- 여러 후보를 임의로 고르거나 글자 모양이 비슷하다는 이유로 추론하지 않는다. `単 → 單`, `続 → 續`처럼 흔한 신·구자체 대응을 사용하며 다른 유사 글자의 독음을 섞지 않는다.
- 호환 한자는 NFC로 정규화하고 자형 선택자는 대응표 처리에서만 제거한다. 사용자 단어 표기나 학습 ID는 수정하지 않는다.

## 재현·검증

```bash
python3 scripts/build_kanji_dictionary.py
```

`dictionary-sources.json`의 고정 HTTPS 경로로만 자료를 다운로드하며 캐시·다운로드 모두 기록된 SHA-256과 비교한다. TLS 및 체크섬 검증을 끄지 않는다. 원본 ZIP/TGZ와 CSV의 스냅샷 체크섬은 다운로드한 실제 바이트의 재현 기준이며 별도 기관의 서명 검증을 의미하지 않는다.

- 앱 반영 파일: `src/data/kanji-dictionary.json`
- 추출 원문 증거: `extraction-evidence.json`
- URL·해시 목록: `scripts/dictionary-sources.json`

이 파일의 한국어 주석과 UI 상태는 출처의 독음/훈음 대조 결과를 설명한다. 모든 단어의 JLPT 등급이나 교재 표기를 사전 검증했다고 주장하지 않는다.
