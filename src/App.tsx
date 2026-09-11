import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { LanguageProvider } from "@/i18n";

export default function App() {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
