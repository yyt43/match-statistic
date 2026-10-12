import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import EntryPage from "@/pages/EntryPage";
import MultiStageSetup from "@/pages/MultiStageSetup";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { LanguageProvider } from "@/i18n";

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <Router>
          <Routes>
            <Route path="/" element={<EntryPage />} />
            <Route path="/multi-stage" element={<MultiStageSetup />} />
            <Route path="/workspace" element={<Home />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
