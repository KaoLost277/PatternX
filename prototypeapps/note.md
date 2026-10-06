# Dynamic Data Completeness Profiler (Pattern Detective)

ระบบเว็บแอปพลิเคชันสำหรับตรวจสอบและวิเคราะห์รูปแบบความครบถ้วนของข้อมูล (Data Completeness Profiling) แบบไดนามิก รองรับไฟล์ขนาดใหญ่ระดับแสนถึงล้านแถว โดยให้ผู้ใช้เลือกคอลัมน์อ้างอิง (Entity Key) และคอลัมน์เป้าหมายเพื่อวิเคราะห์การกรอก/เว้นว่างของข้อมูล พร้อมแสดงผลด้วยรหัสสีและสัดส่วนเปอร์เซ็นต์แบบเรียลไทม์

---

## 1. ปัญหาและที่มา (Problem Statement)

ในการเตรียมข้อมูล (Data Preparation) หรือตรวจสอบข้อมูลระดับองค์กร มักเจอปัญหาข้อมูลขาดหาย (Missing Data) ที่ไม่ได้กระจายตัวแบบสุ่ม แต่มี **"รูปแบบเฉพาะ" (Systemic Pattern)** เช่น:

- มีการอนุมัติระดับ L1 แต่ข้าม L2 ไป L3 (ข้ามขั้นตอน)

- กรอกข้อมูลติดต่อเบอร์โทรศัพท์ แต่ไม่ยอมกรอกอีเมล

- มีข้อมูลส่วนบุคคลครบ แต่เอกสารแนบไม่ครบ

การใช้ Excel ทั่วไปเปิดไฟล์หลักล้านแถวเพื่อฟิลเตอร์หาคู่กรณีเหล่านี้ทำได้ช้ามาก หรือโปรแกรมค้าง ระบบนี้จึงถูกออกแบบมาเพื่อแก้ปัญหานี้โดยเฉพาะด้วยการวิเคราะห์เชิงเวกเตอร์ (Vectorized Analytical Engine)

---

## 2. ฟังก์ชันการทำงานหลัก (Core Features)

1. **Flexible File Ingestion:** รองรับการอัปโหลดไฟล์ตารางรูปแบบ `.csv` และ `.xlsx` โดยไม่ยึดติดกับโครงสร้างหัวตาราง (Schema-agnostic)

2. **Dynamic Header Inspection:** ตรวจจับรายชื่อคอลัมน์ทั้งหมดจากไฟล์อัตโนมัติ เพื่อนำมาสร้างตัวเลือกบนหน้าจอ

3. **Dual Column Selection:**

   - **Entity/Key Column:** เลือกคอลัมน์ตั้งต้นเพื่อระบุตัวตน (เช่น `User ID`, `Employee Name`, `Transaction ID`)

   - **Pattern Columns (Multi-select):** เลือกชุดคอลัมน์ที่ต้องการตรวจจับรูปแบบการกรอกข้อมูล (เลือกได้อิสระ)

4. **Binary Pattern Extraction:** เข้ารหัสสถานะข้อมูลในแต่ละเซลล์เป็นเลขฐานสอง:

   - `1` = มีข้อมูล (Valid Data)

   - `0` = ไม่มีข้อมูล (NULL, Empty String, Space, N/A, None, -)

5. **Pattern Grouping &amp; Aggregation:** คำนวณความถี่และสัดส่วน (%) ของแต่ละ Pattern ทันที

6. **Visual Badges &amp; Color Coding:** แสดงสรุป Pattern แต่ละแบบด้วยป้ายสี:

   - สีเขียว = มีข้อมูล

   - สีเทา/แดง = ช่องว่าง

7. **Interactive Drill-down Preview:** คลิกที่การ์ด Pattern เพื่อกรองตารางตัวอย่างข้อมูลเฉพาะกลุ่มนั้น พร้อมไฮไลต์สีรายเซลล์

---

## 3. สถาปัตยกรรมระบบ (System Architecture)

\`\`\`text

┌─────────────────────────────────────────────────────────────┐

│                 Frontend (Next.js / React)                  │

│  - Drag &amp; Drop File Upload                                  │

│  - Column Configurator (Key Column &amp; Pattern Checkboxes)    │

│  - Pattern Matrix Cards (Badges, Count, %)                  │

│  - Virtualized Preview Table (Color Highlights)             │

└──────────────┬──────────────────────────────▲───────────────┘

               │ 1. Upload File               │ 4. Aggregated Patterns

               │ 2. Select Columns Config     │    &amp; Sample Rows

               ▼                              │

┌─────────────────────────────────────────────┴───────────────┐

│                 Backend API (FastAPI / Node)                │

│  - Endpoint: /api/upload -&gt; บันทึกและแปลงเป็น Parquet       │

│  - Endpoint: /api/columns -&gt; ส่งคืน Header names             │

│  - Endpoint: /api/analyze -&gt; สร้าง Dynamic SQL ตาม Config    │

└──────────────┬──────────────────────────────────────────────┘

               │ In-process Vectorized Query

               ▼

┌─────────────────────────────────────────────────────────────┐

│               Embedded Analytical Engine (DuckDB)           │

│  - Columnar Storage Execution                               │

│  - Multi-threaded Scanning                                  │

│  - Memory-efficient Aggregation (Sub-second on 1M+ rows)    │

└─────────────────────────────────────────────────────────────┘