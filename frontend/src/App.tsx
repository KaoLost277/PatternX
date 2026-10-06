import { useState } from "react";
import type { ChangeEvent } from "react";
import "./App.css";

interface ImportResponse {
  columns: string[];
}

function App() {
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setColumnNames([]);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/imports", { method: "POST", body: formData });
      const responseBody = (await response.json()) as ImportResponse | { detail: string };

      if ("detail" in responseBody) {
        setErrorMessage(responseBody.detail || "The file could not be imported.");
        return;
      }

      setColumnNames(responseBody.columns);
    } catch {
      setErrorMessage("The local API could not be reached. Start it and try again.");
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Data Completeness Profiler</h1>
        <p className="lead">
          Import a CSV file to see the columns it contains. Your file stays on this machine and is
          deleted after it has been read.
        </p>

        <label className="file-picker">
          <span>CSV file</span>
          <input type="file" accept=".csv" onChange={handleFileSelected} />
        </label>

        {selectedFileName && <p className="status-line">Selected file: {selectedFileName}</p>}
        {errorMessage && <p className="error-message">{errorMessage}</p>}

        {columnNames.length > 0 && (
          <div className="result-block">
            <h2>
              Columns in this file ({columnNames.length})
            </h2>
            <ul className="column-list">
              {columnNames.map((columnName, columnIndex) => (
                // Column names can repeat, so the position is the only stable key.
                <li key={columnIndex} className="column-item">
                  {columnName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
