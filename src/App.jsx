
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const TRANSPORTS = {
  truck: { label: "Diesel truck", factor: 0.12 },
  van: { label: "Delivery van", factor: 0.18 },
  electric: { label: "Electric vehicle", factor: 0.04 },
};

// Normalize shipment fields returned by the backend.
function normalizeShipment(shipment) {
  return {
    ...shipment,
    distance: shipment.distance ?? shipment.distance_km ?? 0,
    weight: shipment.weight ?? shipment.weight_kg ?? 0,
    transport: shipment.transport ?? shipment.transport_mode ?? "unknown",
    emissions_kg_co2e:
      shipment.emissions_kg_co2e ?? shipment.emissions ?? 0,
    created_at: shipment.created_at ?? "Recently calculated",
  };
}

function App() {
  const [distance, setDistance] = useState("120");
  const [weight, setWeight] = useState("2");
  const [transport, setTransport] = useState("truck");
  const [emissions, setEmissions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shipments, setShipments] = useState([]);
  const [apiConnected, setApiConnected] = useState(true);

  // Fetch shipment history stored in SQLite.
  async function loadShipments() {
    try {
      const response = await fetch(`${API_URL}/shipments`);

      if (!response.ok) {
        throw new Error(`Shipment request failed: ${response.status}`);
      }

      const data = await response.json();
      setShipments((data.shipments || []).map(normalizeShipment));
      setApiConnected(true);
    } catch (err) {
      console.error("Could not load shipment history:", err);
      setApiConnected(false);
    }
  }

  useEffect(() => {
    loadShipments();
  }, []);

  async function calculateEmissions() {
    if (!Number.isFinite(Number(distance)) || Number(distance) <= 0) {
      setError("Enter a distance greater than zero.");
      return;
    }

    if (!Number.isFinite(Number(weight)) || Number(weight) <= 0) {
      setError("Enter a package weight greater than zero.");
      return;
    }

    setLoading(true);
    setError("");
    setEmissions(null);

    try {
      const response = await fetch(`${API_URL}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance: Number(distance),
          weight: Number(weight),
          transport,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : data.error || "Calculation failed."
        );
      }

      if (data.error) {
        throw new Error(data.error);
      }

      // Support both backend response formats.
      const result = data.emissions_kg_co2e ?? data.emissions;

      if (typeof result !== "number") {
        throw new Error("The API returned an unexpected response.");
      }

      setEmissions(result);
      setApiConnected(true);

      // Reload the actual persisted records instead of creating
      // a fake frontend-only shipment.
      await loadShipments();
    } catch (err) {
      console.error("CarbonBridge calculation error:", err);
      setError(
        err.message ||
          "Could not calculate emissions. Make sure the backend is running at http://127.0.0.1:8000."
      );
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  }

  const totalEmissions = shipments.reduce(
    (total, shipment) =>
      total + Number(shipment.emissions_kg_co2e || 0),
    0
  );

  const electricEmissions =
    Number(distance) > 0 && Number(weight) > 0
      ? Number(distance) * Number(weight) * TRANSPORTS.electric.factor
      : 0;

  const potentialSavings =
    emissions !== null
      ? Math.max(0, emissions - electricEmissions)
      : null;

  const greenerDeliveries = shipments.filter(
    (shipment) => shipment.transport === "electric"
  ).length;

  const greenerPercentage =
    shipments.length > 0
      ? Math.round((greenerDeliveries / shipments.length) * 100)
      : 0;

  function formatNumber(value) {
    return Number(value).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>🌱 CarbonBridge</h2>
        <p className="side-label">WORKSPACE</p>
        <div className="nav active">▦ Overview</div>
        <div className="nav">📦 Shipments</div>
        <div className="nav">🌍 Emissions</div>
        <div className="nav">📊 Reports</div>
        <div className="sidebar-bottom">Sustainability made simple.</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">SELLER WORKSPACE</p>
            <h1>Carbon dashboard</h1>
            <p className="muted">
              Track your delivery footprint, one order at a time.
            </p>
          </div>
          <div className="avatar">CB</div>
        </header>

        <section className="stats">
          <div className="stat-card">
            <p>Total shipments</p>
            <h2>{shipments.length}</h2>
            <span>Calculated shipments</span>
          </div>

          <div className="stat-card">
            <p>Total estimated emissions</p>
            <h2>
              {formatNumber(totalEmissions)} <small>kg CO₂e</small>
            </h2>
            <span>Based on recorded calculations</span>
          </div>

          <div className="stat-card">
            <p>Greener deliveries</p>
            <h2>{greenerPercentage}%</h2>
            <span>Electric shipments in recorded history</span>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel calculator">
            <p className="eyebrow">CARBON CALCULATOR</p>
            <h2>Calculate shipment emissions</h2>
            <p className="muted">
              Enter shipment details to estimate its footprint.
            </p>

            <label htmlFor="distance">Delivery distance (km)</label>
            <input
              id="distance"
              type="number"
              min="0.1"
              step="any"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />

            <label htmlFor="weight">Package weight (kg)</label>
            <input
              id="weight"
              type="number"
              min="0.1"
              step="any"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />

            <label htmlFor="transport">Transport type</label>
            <select
              id="transport"
              value={transport}
              onChange={(event) => setTransport(event.target.value)}
            >
              <option value="truck">Diesel truck</option>
              <option value="van">Delivery van</option>
              <option value="electric">Electric vehicle</option>
            </select>

            <button
              onClick={calculateEmissions}
              disabled={
                loading ||
                !Number.isFinite(Number(distance)) ||
                !Number.isFinite(Number(weight)) ||
                Number(distance) <= 0 ||
                Number(weight) <= 0
              }
            >
              {loading ? "Calculating..." : "Calculate emissions →"}
            </button>

            {error && <p className="error-message">{error}</p>}

            {emissions !== null && (
              <div className="result">
                <span>Estimated shipment footprint</span>
                <h2>{formatNumber(emissions)} kg CO₂e</h2>
                <p>
                  Estimated using CarbonBridge's illustrative emission factors.
                </p>

                {transport !== "electric" && (
                  <div className="recommendation">
                    <strong>🌿 Consider electric delivery</strong>
                    <p>
                      Estimated emissions for an electric vehicle on the same
                      shipment: {formatNumber(electricEmissions)} kg CO₂e.
                    </p>
                    <p>
                      Potential reduction: {formatNumber(potentialSavings)} kg
                      CO₂e.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setTransport("electric");
                        setEmissions(null);
                        setError("");
                      }}
                    >
                      Compare electric delivery
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel">
            <p className="eyebrow">SUSTAINABILITY INSIGHT</p>
            <h2>Make deliveries greener 🌿</h2>
            <p className="muted">
              Compare the illustrative factors used by this prototype.
            </p>

            {Object.entries(TRANSPORTS).map(([key, option]) => (
              <div
                className={`option ${key === "electric" ? "recommended" : ""}`}
                key={key}
              >
                <span>
                  {key === "truck"
                    ? "🚚"
                    : key === "van"
                      ? "🚐"
                      : "⚡"}{" "}
                  {option.label}
                </span>
                <strong>{option.factor.toFixed(2)} factor</strong>
              </div>
            ))}

            <p className="footnote">
              Placeholder factors only. The current formula is distance ×
              package weight × factor. Actual emissions depend on the vehicle,
              load, route, and electricity source.
            </p>

            <div className="option">
              <span>📦 Recorded shipments</span>
              <strong>{shipments.length}</strong>
            </div>

            <div className="option">
              <span>🌍 Total footprint</span>
              <strong>{formatNumber(totalEmissions)} kg</strong>
            </div>
          </div>
        </section>

        <section className="panel recent">
          <p className="eyebrow">RECENT ACTIVITY</p>
          <h2>Shipment history</h2>

          {shipments.length === 0 ? (
            <p className="muted">
              No shipments calculated yet. Use the carbon calculator to add
              your first shipment.
            </p>
          ) : (
            shipments.map((shipment, index) => (
              <div className="shipment" key={shipment.id ?? index}>
                <div>
                  <strong>
                    {typeof shipment.id === "number"
                      ? `#CB-${String(shipment.id).padStart(4, "0")}`
                      : shipment.id || `#CB-${index + 1}`}
                  </strong>
                  <p>
                    {TRANSPORTS[shipment.transport]?.label ||
                      shipment.transport}{" "}
                    · {formatNumber(shipment.distance)} km ·{" "}
                    {formatNumber(shipment.weight)} kg
                  </p>
                  <p className="muted">{shipment.created_at}</p>
                </div>

                <span className="pill">Saved</span>

                <strong>
                  {formatNumber(shipment.emissions_kg_co2e)} kg CO₂e
                </strong>
              </div>
            ))
          )}

          {!apiConnected && (
            <p className="muted">
              Shipment history may be unavailable until the backend reconnects.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
