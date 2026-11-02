export const ECOMMERCE_SAMPLE_CSV = `order_id,customer_name,email,phone,order_date,status,amount,postal_code
ORD-1001,Alice Johnson,alice.j@example.com,555-0101,2026-01-15,COMPLETED,129.50,94016
ORD-1002,Bob Smith,bob.smith@example.org,,2026-01-16,PENDING,45.00,90210
ORD-1003,Charlie Davis,,555-0103,2026-01-16,COMPLETED,320.00,10001
ORD-1004,Diana Prince,diana@themyscira.io,555-0104,2026-01-17,COMPLETED,89.99,94016
ORD-1005,Evan Wright,evan.w@example.com,,2026-01-18,CANCELLED,15.50,
ORD-1006,Fiona Gallagher,,555-0106,2026-01-18,COMPLETED,210.00,60601
ORD-1007,George Clark,george.c@example.net,555-0107,2026-01-19,PENDING,75.25,90210
ORD-1008,Hannah Abbott,hannah@example.com,555-0108,2026-01-19,COMPLETED,430.00,10001
ORD-1009,Ian Malcolm,,555-0109,2026-01-20,PENDING,60.00,78701
ORD-1010,Julia Roberts,julia@example.com,555-0110,2026-01-20,COMPLETED,520.00,90210
ORD-1011,Kevin Bacon,kevin@example.org,,2026-01-21,COMPLETED,115.00,10001
ORD-1012,Laura Croft,laura@tomb.org,555-0112,2026-01-22,COMPLETED,950.00,94016
ORD-1013,Michael Scott,,555-0113,2026-01-22,CANCELLED,29.99,18503
ORD-1014,Nina Simone,nina@music.com,555-0114,2026-01-23,COMPLETED,180.50,10001
ORD-1015,Oscar Martinez,oscar@example.com,555-0115,2026-01-23,COMPLETED,340.00,18503
ORD-1016,Pam Beesly,pam@art.org,,2026-01-24,PENDING,55.00,18503
ORD-1017,Quentin Tarantino,quentin@pulp.com,555-0117,2026-01-24,COMPLETED,275.00,90210
ORD-1018,Rachel Green,,555-0118,2026-01-25,COMPLETED,410.00,10001
ORD-1019,Steve Rogers,steve@avengers.org,555-0119,2026-01-25,COMPLETED,150.00,11201
ORD-1020,Tony Stark,tony@stark.com,555-0120,2026-01-26,COMPLETED,9999.00,90265
ORD-1021,Uma Thurman,,555-0121,2026-01-26,PENDING,85.00,90210
ORD-1022,Victor Frankenstein,victor@lab.org,,2026-01-27,CANCELLED,240.00,
ORD-1023,Wanda Maximoff,wanda@magic.io,555-0123,2026-01-27,COMPLETED,670.00,07030
ORD-1024,Xavier Charles,xavier@mutant.edu,555-0124,2026-01-28,COMPLETED,1200.00,10560
ORD-1025,Yvonne Strahovski,,555-0125,2026-01-28,COMPLETED,310.00,90210`;

export const EMPLOYEE_SAMPLE_CSV = `employee_id,full_name,department,role,salary,hire_date,termination_date
EMP-001,Eleanor Vance,Engineering,Senior Architect,135000,2021-03-01,
EMP-002,Arthur Pendelton,Marketing,Content Strategist,72000,2022-06-15,
EMP-003,Marcus Holloway,Engineering,Security Analyst,115000,2020-01-10,2024-05-30
EMP-004,Chloe Decker,Sales,Account Executive,88000,2023-02-01,
EMP-005,Lucifer Morningstar,Sales,Director of Sales,160000,2019-11-15,
EMP-006,Linda Martin,Human Resources,HR Director,125000,2018-08-20,
EMP-007,Dan Espinoza,Human Resources,People Partner,68000,2022-09-01,2025-01-15
EMP-008,Ella Lopez,Engineering,QA Lead,98000,2021-07-12,
EMP-009,Amenadiel Firstborn,Management,VP Operations,175000,2017-04-01,
EMP-010,Mazikeen Smith,Security,Head of Physical Security,105000,2020-10-05,
EMP-011,Trixie Espinoza,Marketing,Junior Designer,52000,2024-01-10,
EMP-012,Benoit Blanc,Finance,Senior Auditor,130000,2022-04-18,
EMP-013,Marta Cabrera,Finance,Staff Accountant,78000,2023-05-22,
EMP-014,Ransom Drysdale,Finance,Financial Analyst,85000,2021-11-01,2023-12-31
EMP-015,Walter White,Engineering,Chief Chemist,145000,2019-02-14,2024-08-10
EMP-016,Jesse Pinkman,Engineering,Junior Associate,55000,2023-08-01,
EMP-017,Saul Goodman,Legal,General Counsel,150000,2020-05-01,
EMP-018,Kim Wexler,Legal,Senior Counsel,140000,2021-01-15,
EMP-019,Howard Hamlin,Management,Managing Partner,190000,2016-01-01,2024-06-20
EMP-020,Chuck McGill,Legal,Senior Partner,200000,2015-06-01,2023-10-15
EMP-021,Gus Fring,Management,CEO,250000,2015-01-01,
EMP-022,Mike Ehrmantraut,Security,Security Consultant,110000,2018-03-15,
EMP-023,Hank Schrader,Security,Compliance Officer,95000,2021-09-01,
EMP-024,Skyler White,Finance,Controller,112000,2020-04-01,
EMP-025,Marie Schrader,Human Resources,Recruiting Specialist,64000,2023-11-15,`;

export type SampleDatasetKind = "ecommerce" | "employee";

export function createSampleDatasetFile(kind: SampleDatasetKind): File {
  const isEcommerce = kind === "ecommerce";
  const content = isEcommerce ? ECOMMERCE_SAMPLE_CSV : EMPLOYEE_SAMPLE_CSV;
  const fileName = isEcommerce ? "sample_ecommerce_orders.csv" : "sample_employee_directory.csv";

  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  return new File([blob], fileName, { type: "text/csv", lastModified: Date.now() });
}
