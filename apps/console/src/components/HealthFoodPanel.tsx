import { FoodAlignmentCard } from "./FoodAlignmentCard";

export function HealthFoodPanel() {
  return (
    <section className="health-panel" aria-label="Food">
      <div className="health-shell">
        <header className="health-heading">
          <div>
            <span>Health</span>
            <h3>Food</h3>
          </div>
        </header>
        <FoodAlignmentCard />
      </div>
    </section>
  );
}
