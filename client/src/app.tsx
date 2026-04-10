import { Route, Routes } from "react-router-dom";
import { DeckEditorRoute } from "./features/decks/deck-editor-route";
import { DeckLibraryRoute } from "./features/decks/deck-library-route";
import { NewDeckRoute } from "./features/decks/new-deck-route";
import { HomeRoute } from "./routes/home";
import { TableRoute } from "./routes/table";

export function App() {
  return (
    <div className="app-shell">
      <main className="page-frame">
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/table/:id" element={<TableRoute />} />
          <Route path="/decks" element={<DeckLibraryRoute />} />
          <Route path="/decks/new" element={<NewDeckRoute />} />
          <Route path="/decks/:id" element={<DeckEditorRoute />} />
        </Routes>
      </main>
    </div>
  );
}
