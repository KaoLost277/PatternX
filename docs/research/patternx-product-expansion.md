# ข้อเสนอการขยาย PatternX: จากการสำรวจข้อมูลสู่การตรวจตามกติกาที่ผู้ใช้กำหนด

**วันที่ค้นคว้า:** 2026-10-10
**ข้อสรุปจากการค้นคว้า:** เริ่มจาก “กติกาข้อมูลที่ผู้ใช้ระบุเอง” ในรูปแบบ JSON แบบมีเวอร์ชัน ซึ่งใช้ตรวจข้อมูลในเครื่องและรายงานจำนวนที่ตรง/ไม่ตรงกติกา จากนั้นเพิ่มการเปรียบเทียบสรุปข้อมูลระหว่างไฟล์ และการสำรวจคีย์ที่ไม่ซ้ำ ข้อเสนอนี้ต่อยอดจากการทำโปรไฟล์แบบตรงไปตรงมา โดยไม่เปลี่ยน PatternX ให้เป็น cloud service, ระบบเฝ้าระวังอัตโนมัติ หรือระบบแก้ข้อมูล

**ลำดับที่ผู้ใช้เลือก:** เริ่ม implementation ด้วยรายงาน uniqueness ที่ต่อยอดจาก Group Data แล้วทำ contract JSON เป็นฟีเจอร์ถัดไป เหตุผลคือใช้ groups ที่มีอยู่และไม่ต้องเริ่มจากนิยาม parsing/contract ใหม่ ลำดับผลิตภัณฑ์ปัจจุบันอยู่ใน [roadmap](../roadmaps/product-expansion.md) และ [spec](../requirements/product-expansion-spec.md). การตัดสินใจนี้เปลี่ยนลำดับ ไม่ได้เปลี่ยนข้อเท็จจริงจากแหล่งอ้างอิงด้านล่าง

## จุดแข็งและขอบเขตปัจจุบัน

ข้อเท็จจริงจากเอกสารและโค้ดโครงการ: PatternX รับ CSV หรือหนึ่ง worksheet ที่ผู้ใช้เลือกจาก XLSX และมีโหมด Completeness Patterns, Formal Terms และ Group Data; ความหมายของ Input Row ยังคงนับแต่ละแถวแยกกัน ไม่รวมแถวเพราะ Identifier Column ซ้ำ ([AnalysisModeTabs.tsx](../../frontend/src/AnalysisModeTabs.tsx), [data_analyses.py](../../backend/app/data_analyses.py), [CONTEXT.md](../../CONTEXT.md)). README และ ROADMAP ยังไม่ได้อธิบายโหมด Formal Terms และ Group Data ที่มีอยู่ในโค้ด ([README](../../README.md#current-status), [ROADMAP](../ROADMAP.md)). แอปทำงาน local/offline, API ผูกกับ loopback, ไม่มีคำขอ runtime ภายนอกหรือการส่งข้อมูลออก; raw upload/normalized files ถูกลบ ส่วน SQLite ที่มีข้อมูลแถวเก็บได้ชั่วคราวตามอายุงานและกฎ cleanup ([README](../../README.md#run-locally), [ADR-0001](../adr/0001-local-offline-profiler.md), [ADR-0002](../adr/0002-use-python-sqlite-for-local-analysis.md)). Completeness Summary เป็นรายงานเชิงพรรณนาและไม่ได้ติดป้ายรูปแบบว่าเป็น anomalous ([CONTEXT.md](../../CONTEXT.md#L33-L34)).

**การตีความหลักฐาน:** ข้อกำหนดและคู่มือด้านล่างยืนยันว่ามีรูปแบบ metadata, validation และการเปรียบเทียบสคีมาที่นำมาใช้เป็นแนวทางได้ ไม่ได้พิสูจน์ความต้องการของผู้ใช้ PatternX หรือระบุว่า PatternX ต้องทำตามผลิตภัณฑ์เหล่านั้นทั้งหมด การเลือกลำดับ, MVP, และระดับการรองรับมาตรฐานในเอกสารนี้เป็นข้อเสนอผลิตภัณฑ์

## ข้อเสนอที่จัดลำดับแล้ว

### 1. กติกาข้อมูลที่ผู้ใช้กำหนดเอง (แนะนำให้ทำก่อน)

- **ปัญหาผู้ใช้:** สรุปปัจจุบันบอกได้ว่าเกิดค่าอะไรและขาดหายแค่ไหน แต่ผู้ใช้ยังบันทึกความคาดหวังของชุดข้อมูล เช่น “คอลัมน์นี้ต้องมีค่า” หรือ “คอลัมน์นี้ควรเป็นหนึ่งในรายการที่กำหนด” แล้วนำกลับมาตรวจไฟล์รอบถัดไปไม่ได้
- **MVP ที่เสนอ:** ให้ผู้ใช้สร้าง/นำเข้า/ส่งออกไฟล์ contract JSON ซึ่งผูกกติกากับชื่อคอลัมน์; เริ่มรองรับ `required`, ชนิดที่ระบุชัด (เช่น integer/number/date ในรูปแบบที่รองรับ) และ `enum`; แสดงจำนวน `Input Row` ที่หาย, ผ่าน, และไม่ผ่านต่อกติกา พร้อมจำนวนแถวทั้งหมด ใช้ตัวนับ ไม่แสดงค่าตัวอย่างหรือส่งออกแถวที่ไม่ผ่านโดยปริยาย
- **เหตุผลที่เหมาะ:** เป็นการต่อยอดจาก Column Completeness และ Formal Terms โดยยังให้ผู้ใช้เป็นผู้กำหนดความหมายและกติกาเอง และไฟล์ contract ที่ผู้ใช้ส่งออกเองไม่ต้องเพิ่มประวัติงานหรือฐานข้อมูลถาวรในแอป
- **หลักฐาน:** Frictionless Table Schema นิยาม metadata สำหรับคอลัมน์และข้อจำกัด เช่น `required`, `unique`, `minimum`/`maximum`, `pattern`, `enum` และ primary key โดยข้อจำกัดทดสอบกับ logical representation ([Table Schema — Constraints / Primary Key](https://specs.frictionlessdata.io/table-schema/#constraints), เข้าถึง 2026-10-10). W3C CSVW อธิบาย metadata สำหรับชนิดข้อมูลและ `required` รวมถึงการตรวจชื่อคอลัมน์ ชนิด/รูปแบบ และค่าที่มี/ไม่ซ้ำ ([W3C Metadata Vocabulary for Tabular Data](https://www.w3.org/TR/tabular-metadata/), เข้าถึง 2026-10-10). เอกสารของ Great Expectations แสดงตัวอย่างการตรวจการมีคอลัมน์ ชนิดข้อมูล ลำดับคอลัมน์, missingness, ค่าในช่วง และรายการ quantile เป็นกติกาที่ผู้ใช้เลือกกำหนดได้ ([GX: schema](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/schema/), [GX: missingness](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/missingness/), [GX: distribution](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/distribution/), เข้าถึง 2026-10-10).
- **ความซับซ้อน/การพึ่งพา:** ปานกลาง; ต้องกำหนดไวยากรณ์ contract ที่มีเวอร์ชัน, การจับคู่ชื่อคอลัมน์, การตีความชนิด/วันที่, การนับผลแบบไม่ทำให้กฎ Missing Value ปัจจุบันเปลี่ยน และการยกเลิกงาน/ลบ temporary data ให้คงพฤติกรรมเดิม
- **ความเสี่ยง/ขอบเขต:** Table Schema ระบุให้ `missingValues` ถูกประมวลผลก่อนแปลงชนิด ขณะที่ PatternX ตัดช่องว่างและจับ marker แบบไม่สนตัวพิมพ์ใหญ่เล็ก ดังนั้นอย่านำ semantics ของมาตรฐานมาแทนกติกาเดิมโดยเงียบ ๆ; ระบุการรองรับเป็น subset, เตือนเมื่อพบกฎที่ไม่รองรับ และแยก missing ออกจาก invalid ([Table Schema — Missing Values](https://specs.frictionlessdata.io/table-schema/#missing-values), เข้าถึง 2026-10-10; [CONTEXT.md](../../CONTEXT.md#L39-L40)). เริ่มจาก required/enum/ชนิดมาตรฐานที่ทดสอบได้; เลื่อน regex ซึ่งมีความต่างด้าน dialect และ foreign keys ไปภายหลัง ไม่อ้างว่าเป็น Table Schema validator ที่สมบูรณ์

### 2. บันทึกและเปรียบเทียบ Profile Snapshot แบบเลือกเอง

- **ปัญหาผู้ใช้:** เมื่อรับไฟล์รอบใหม่ ผู้ใช้ต้องมองเห็นการเปลี่ยนคอลัมน์และตัวชี้วัดเทียบกับไฟล์ก่อน โดยไม่ต้องเก็บไฟล์ข้อมูลต้นฉบับไว้ใน PatternX
- **MVP ที่เสนอ:** เพิ่มปุ่มบันทึก Profile Snapshot JSON ไปยังตำแหน่งที่ผู้ใช้เลือก และนำ snapshot สองชุดมาเปรียบเทียบ; แสดงคอลัมน์เพิ่ม/หาย/ลำดับเปลี่ยน พร้อมส่วนต่างของจำนวนแถว, completeness share, จำนวน Formal Terms และจำนวน Structural Format Patterns จับคู่คอลัมน์ด้วยชื่อแบบตรงก่อน และให้ผู้ใช้กำหนด mapping เองเมื่อชื่อเปลี่ยน
- **ปกป้องข้อมูล:** Snapshot รุ่นแรกไม่เก็บ Input Rows, ตัวอย่าง, exact Formal Terms, exact Group Data tuples หรือ path ของไฟล์; แต่ชื่อคอลัมน์และสถิติ aggregate ก็ยังอาจเป็นข้อมูลอ่อนไหว ให้ผู้ใช้เป็นผู้สั่ง export/import และแสดงคำเตือนก่อนบันทึก ห้ามสร้างประวัติ snapshot อัตโนมัติในแอป
- **หลักฐาน:** Frictionless Tabular Diff แสดงตัวอย่างการแทนคอลัมน์ที่เพิ่ม/ลบ/เปลี่ยนชื่อในรูป diff ของตาราง ([Tabular Diff Format](https://specs.frictionlessdata.io/tabular-diff/), เข้าถึง 2026-10-10). GX แยกการตรวจ schema ตามชื่อ/ชนิด/ชุด/ลำดับคอลัมน์ และยกตัวอย่างการเทียบผลตรวจระหว่างเวลา ([GX: schema](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/schema/), เข้าถึง 2026-10-10). AWS Glue มี `SchemaMatch` สำหรับเทียบชื่อและชนิดคอลัมน์กับชุดข้อมูลอ้างอิง โดยไม่นำลำดับคอลัมน์มาพิจารณา ([AWS Glue SchemaMatch](https://docs.aws.amazon.com/glue/latest/dg/dqdl-rule-types-SchemaMatch.html), เข้าถึง 2026-10-10). สิ่งเหล่านี้เป็นตัวอย่างแนวคิดการเปรียบเทียบ ไม่ใช่ข้อเสนอให้นำบริการ cloud มาใช้
- **ความซับซ้อน/การพึ่งพา:** ปานกลาง; ต้องกำหนด schema/version ของ snapshot, การจับคู่เมื่อชื่อหรือ worksheet เปลี่ยน และนิยามว่าสถิติใดเปรียบเทียบกันได้
- **ความเสี่ยง:** ข้อมูล aggregate ไม่เท่ากับข้อมูลปลอดความลับ; จำนวนค่าที่แตกต่างหรือ completeness ที่เฉพาะเจาะจงอาจเปิดเผยข้อมูลเกี่ยวกับชุดข้อมูลได้ จึงไม่ควรรวมค่าจริงหรือกลุ่มค่าจริงเป็นค่าเริ่มต้น และต้องไม่เรียกการเปลี่ยนแปลงว่า anomaly โดยอัตโนมัติ

### 3. รายงานความเป็นเอกลักษณ์ของคอลัมน์/ชุดคอลัมน์ที่ผู้ใช้เลือก

- **ปัญหาผู้ใช้:** ผู้ใช้ต้องการตอบคำถามว่า “คอลัมน์นี้” หรือ “ค่าร่วมของคอลัมน์เหล่านี้” ไม่ซ้ำจริงหรือไม่ โดยไม่สรุปเองว่าค่าซ้ำหมายถึง entity เดียวกันหรือแถวซ้ำที่ต้องลบ
- **MVP ที่เสนอ:** ให้ผู้ใช้เลือกหนึ่งคอลัมน์หรือชุดคอลัมน์เพื่อรายงานจำนวน Group Data Key ทั้งหมด, จำนวน key ที่มี Input Row มากกว่าหนึ่งแถว, จำนวนแถวที่อยู่ในกลุ่ม key ซ้ำ และสัดส่วนที่ key ไม่ซ้ำ; ใช้ semantics ของ Group Data ปัจจุบันและคงการนับทุก Input Row แยกจากกัน
- **เหตุผลที่เหมาะ:** PatternX มี Group Data Summary ซึ่งจัดกลุ่ม tuple ที่พบจริงพร้อมจำนวน/สัดส่วนอยู่แล้ว ([CONTEXT.md](../../CONTEXT.md#L27-L31)); รายงานนี้เพิ่มการสรุปอ่านเร็วเหนือข้อมูลเดิม ไม่ต้องอนุมานความหมายธุรกิจ
- **หลักฐาน:** Frictionless Table Schema นิยาม primary key ได้จากคอลัมน์เดี่ยวหรือหลายคอลัมน์ และกำหนดว่า primary key ต้องไม่เป็น null และไม่ซ้ำ ([Table Schema — Primary Key](https://specs.frictionlessdata.io/table-schema/#primary-key), เข้าถึง 2026-10-10). GX แยกการตรวจ uniqueness คอลัมน์เดี่ยวกับ compound columns และเตือนให้พิจารณาบริบทธุรกิจและนโยบาย null ([GX: uniqueness](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/uniqueness/), เข้าถึง 2026-10-10).
- **ความซับซ้อน/การพึ่งพา:** ต่ำถึงปานกลาง หากคำนวณจาก Group Data aggregation ที่มีอยู่; ต้องวัดผลกับ cardinality สูงและจำกัดจำนวนคอลัมน์ที่เลือกตามที่ benchmark รองรับ
- **ความเสี่ยง:** รายงานเป็น “สถิติความไม่ซ้ำของคอลัมน์ที่เลือก” ไม่ใช่การตรวจพบ Identifier Column/primary key โดยอัตโนมัติ และไม่ใช่การ deduplicate; ค่า Group Data ที่แสดงยังคงเป็นข้อมูลดิบที่อาจอ่อนไหว

### 4. สรุปการกระจายตัวเลข/วันที่ เมื่อผู้ใช้ประกาศชนิดเอง

- **ปัญหาผู้ใช้:** Formal Terms เหมาะกับการเห็นค่าจริงและความถี่ แต่ไม่สรุปค่ากลาง/ช่วงของคอลัมน์ตัวเลขหรือวันที่
- **MVP ที่เสนอ:** หลังผู้ใช้เลือกชนิดและรูปแบบเอง ให้รายงานจำนวนค่าที่แปลงได้/ไม่ได้, min, max, median และ quantiles ที่กำหนดไว้; ค่าที่แปลงไม่ได้แยกเป็นจำนวน ไม่กำหนดว่าเป็น anomaly และไม่แปลง/เขียนทับข้อมูลต้นฉบับ
- **หลักฐาน:** Table Schema รองรับการประกาศ datatype/format และข้อจำกัดเชิงช่วง ([Table Schema — Types and Formats / Constraints](https://specs.frictionlessdata.io/table-schema/#types-and-formats), เข้าถึง 2026-10-10). GX มีตัวอย่าง summary statistics เช่น min, max, mean, median, standard deviation และ quantile รวมถึงกติกาตรวจช่วง ([GX: distribution](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/distribution/), เข้าถึง 2026-10-10). อ้างอิงเหล่านี้แสดงชนิดรายงานที่เป็นไปได้ ไม่ได้แนะนำให้ PatternX ทำ distribution anomaly detection
- **ความซับซ้อน/การพึ่งพา:** ปานกลางถึงสูง; CSV เก็บค่าเป็นข้อความ จึงต้องนิยาม parsing/locale, ความเที่ยงตรงเลขทศนิยม, format ของวันที่ และวิธีคำนวณ quantile; ต้อง benchmark เพิ่มก่อนรับประกันเวลา
- **ความเสี่ยง:** การเดาชนิดอัตโนมัติอาจทำให้ผู้ใช้เข้าใจผิด โดยเฉพาะรหัสที่หน้าตาเหมือนเลข; ให้ผู้ใช้เลือกชนิด และแสดง format/วิธี parse ที่ใช้ทุกครั้ง

## Slice แรกและแผนทำเป็นระยะ

**Slice แรกที่แนะนำ:** “ตรวจ required + enum + ชนิดพื้นฐานที่ระบุชัด” ด้วย contract JSON แบบมีเวอร์ชัน โดยยังไม่ทำ regex, foreign keys, กฎอัตโนมัติ หรือประวัติในแอป. UI แสดงจำนวน missing/pass/fail ต่อคอลัมน์; export contract ไม่รวมข้อมูลแถว. รองรับ subset ที่ระบุชัดและปฏิเสธ/เตือนกฎที่ไม่รองรับแทนการเพิกเฉยเงียบ ๆ. แนวทางนี้ใช้ metadata/constraints ที่มีใน Table Schema และคง missing semantics ของ PatternX ไว้ ([Table Schema — Field Descriptors / Constraints](https://specs.frictionlessdata.io/table-schema/#field-descriptors), [Missing Values](https://specs.frictionlessdata.io/table-schema/#missing-values), เข้าถึง 2026-10-10; [CONTEXT.md](../../CONTEXT.md)).

1. **ระยะ 1 — Contract ขั้นต่ำ:** required, enum และชนิด/format ที่เลือกไว้; contract JSON import/export; ตัวเลขผลนับแบบ aggregate เท่านั้น.
2. **ระยะ 2 — ความเป็นเอกลักษณ์:** เพิ่มรายงาน uniqueness สำหรับคอลัมน์/ชุดคอลัมน์ที่ผู้ใช้เลือก โดย reuse Group Data aggregation; ออกแบบคำเตือน cardinality และ benchmark ก่อนขยายจำนวนคอลัมน์.
3. **ระยะ 3 — Snapshot comparison:** export/import สถิติ aggregate ที่คัดกรองแล้วและเปรียบเทียบสองชุดแบบไม่เก็บประวัติอัตโนมัติ; ตกลง privacy review และ version migration ก่อนเปิดใช้งาน.
4. **ระยะ 4 — Numeric/date profile:** ทำเมื่อ parsing และ benchmark สำหรับรูปแบบที่ต้องการชัดเจน; เริ่มด้วย summary statistics เชิงพรรณนา ไม่ทำ drift alerts หรือ anomaly labels.

**เกณฑ์ยอมรับข้ามทุกระยะ:** ผลนับต้อง exact และไม่ truncate; Input Row/Identifier Column/Missing Value ยังคงความหมายเดิม; ข้อมูลแถวและ temp SQLite ถูก cleanup ตาม ADR-0001; ทำงานเมื่อไม่มี network; ตรวจ CSV/XLSX, cancel/failure/cleanup และ hostile values; และบันทึก benchmark เฉพาะ workload ที่วัดจริง ([ADR-0001](../adr/0001-local-offline-profiler.md), [ADR-0002](../adr/0002-use-python-sqlite-for-local-analysis.md), [README.md — Analysis jobs](../../README.md#analysis-jobs)).

## ข้อเสนอที่ไม่ควรทำในขอบเขตนี้

- **Cloud upload, SaaS dashboard, telemetry, หรือ remote API** — ขัดกับการออกแบบ local/offline, loopback-only และข้อตกลงไม่ส่งข้อมูลออกของ PatternX ([ADR-0001](../adr/0001-local-offline-profiler.md)).
- **ดึง CSVW metadata หรือกติกาจาก URL อัตโนมัติ** — แม้ W3C CSVW อนุญาต metadata ที่อ้างอิงด้วย URL และมีกระบวนการ normalization ที่ดึง object ที่อ้างอิง แต่การทำเช่นนั้นจะสร้าง network dependency ที่ไม่เหมาะกับขอบเขตนี้; หากรองรับ metadata ในอนาคตให้รับไฟล์ local ที่ผู้ใช้เลือกเท่านั้น ([W3C CSVW — Object Properties](https://www.w3.org/TR/tabular-metadata/#object-properties), เข้าถึง 2026-10-10; [ADR-0001](../adr/0001-local-offline-profiler.md)).
- **auto-label “anomaly”, จัดอันดับความผิดปกติ, auto-correct หรือ deduplicate** — ความถี่ต่ำ/รูปแบบใหม่ไม่ได้แปลว่าผิด; นอกเหนือจากการหลีกเลี่ยง false positives แล้ว การติดป้ายเช่นนั้นขัดกับนิยาม Completeness Summary ที่เป็นคำอธิบาย ไม่ใช่ anomaly label ([CONTEXT.md](../../CONTEXT.md#L33-L34); [ROADMAP.md — Not in the initial scope](../ROADMAP.md#not-in-the-initial-scope)).
- **ประวัติงานถาวรหรือการส่งออกแถวดิบโดยอัตโนมัติ** — ไม่ควรเพิ่มโดยปริยาย เพราะ PatternX ลบข้อมูลชั่วคราวและไม่เก็บประวัติงานถาวร ([ADR-0001](../adr/0001-local-offline-profiler.md)). อย่างไรก็ตาม การดู/ส่งออกแถวที่ตรงกับ Completeness Pattern หรือผล Data Analysis แบบผู้ใช้สั่งเองมีอยู่แล้วและไม่ขัดกับ ADR-0001; นี่ต่างจากการเก็บหรือส่งออกแถวดิบทั้งหมดโดยอัตโนมัติ ([ข้อกำหนด row details/export](../requirements/pattern-row-details-and-export.md), [API routes](../../backend/app/main.py)). Snapshot aggregate ที่ผู้ใช้สั่งบันทึกเองเป็นไฟล์ local ยังต้องผ่าน privacy review เพราะชื่อคอลัมน์และสถิติอาจอ่อนไหว ไม่ใช่เหตุผลให้แอปเก็บประวัติแทนผู้ใช้

## แหล่งอ้างอิงภายนอก

ทุกแหล่งภายนอกด้านล่างเป็นมาตรฐานหรือเอกสารจากเจ้าของผลิตภัณฑ์/โครงการ; วันที่เข้าถึง: **2026-10-10**.

1. Frictionless Data, [Table Schema](https://specs.frictionlessdata.io/table-schema/).
2. W3C, [Metadata Vocabulary for Tabular Data (CSVW)](https://www.w3.org/TR/tabular-metadata/).
3. Great Expectations, [Validate data schema](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/schema/).
4. Great Expectations, [Manage missing data](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/missingness/).
5. Great Expectations, [Validate data uniqueness](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/uniqueness/).
6. Great Expectations, [Validate data distribution](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/distribution/).
7. Frictionless Data, [Tabular Diff Format](https://specs.frictionlessdata.io/tabular-diff/).
8. AWS Glue, [SchemaMatch rule type](https://docs.aws.amazon.com/glue/latest/dg/dqdl-rule-types-SchemaMatch.html).
