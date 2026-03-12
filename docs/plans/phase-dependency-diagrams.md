# Phase Dependency Diagrams

Generated: 2026-03-10

**Note:** All phases (B, 3, 4, 5, 6) have completed the full planning pipeline and have final implementation plans ready. Phase 3-6 diagrams show the high-level component structure; see each phase's `*-final-plan.md` for the authoritative implementation details and staff-review corrections.

---

## 1. Cross-Phase Sequencing

This diagram shows which phases must complete before others can begin. Phases 0, 1, and 2 are already merged.

```mermaid
graph TD
    P0["Phase 0: Holdings Sync<br/>(DONE - PR #3)"]
    P1["Phase 1: NW by Account Type + CAGR<br/>(DONE - PR #4)"]
    P2["Phase 2: NW Milestones + Retirement<br/>(DONE - PR #5)"]
    P2_1["Phase 2.1: Investable Capital Fix<br/>(S - Next)"]
    PB["Phase B: Backend Modularization<br/>(M - Planning Done, Ready)"]
    P3["Phase 3: Investments Page<br/>(L - Planning Done, Ready)"]
    P4["Phase 4: Forecasting Page<br/>(L - Planning Done, Ready)"]
    P5["Phase 5: Monte Carlo + AI Narrative<br/>(M - Planning Done, Ready)"]
    P6["Phase 6: Benchmark Comparison<br/>(S - Planning Done, Ready)"]

    P0 --> P1
    P1 --> P2
    P2 --> P2_1

    %% Phase B gates all new feature phases
    PB --> P3
    PB --> P4

    %% Feature dependencies from requirements
    P0 --> P3
    P1 --> P4
    P2 --> P4
    P4 --> P5
    P3 --> P6

    %% Parallel opportunities
    style P3 fill:#2d5a3d,stroke:#4a8c6a
    style P4 fill:#2d5a3d,stroke:#4a8c6a
    style P6 fill:#3d4a5a,stroke:#6a8caa
    style P5 fill:#3d4a5a,stroke:#6a8caa
    style PB fill:#5a3d2d,stroke:#8c6a4a
    style P2_1 fill:#5a3d2d,stroke:#8c6a4a
```

**Key sequencing rules:**

- **Phase B must land before Phases 3-6 begin.** The monolith split avoids merge conflicts as those phases add new routes.
- **Phase 2.1 is independent of Phase B** -- it modifies frontend only (retirement tracker). Can run in parallel with Phase B.
- **Phases 3 and 4 can run in parallel** after Phase B lands, since they target different pages (Investments vs Forecasting) with no shared new code.
- **Phase 5 depends on Phase 4** -- Monte Carlo and AI narrative layer build on the Forecasting page.
- **Phase 6 depends on Phase 3** -- benchmark comparison extends the Investments page.
- **Phases 5 and 6 can run in parallel** since they target different pages.

---

## 2. Phase B: Backend Modularization — Implementation Diagram

Source: `phase-b-final-plan.md`

```mermaid
graph TD
    subgraph GroupA["Group A: Infrastructure (parallel)"]
        C1["db.py<br/>Extract DB helpers + DDL"]
        C3["routes/__init__.py<br/>Blueprint scaffold"]
    end

    subgraph GroupB["Group B: AI Module"]
        C2["ai.py<br/>Extract AI helpers + rate limit"]
    end

    subgraph GroupC_independent["Group C: Route Modules (parallel after Group B)"]
        C4["routes/setup.py<br/>Setup + token routes"]
        C5["routes/settings.py<br/>Settings CRUD routes"]
        C6["routes/retirement.py<br/>Retirement save/load routes"]
        C7["routes/groups.py<br/>Category group routes"]
        C8["routes/budgets.py<br/>Budget history routes"]
        C9["routes/networth.py<br/>Net worth + accounts routes"]
        C10["routes/sync.py<br/>Sync pipeline + scheduler"]
    end

    subgraph GroupC_ai["Group C: AI Route Modules (parallel, need ai.py)"]
        C11["routes/ai_routes.py<br/>AI config + analyze routes"]
        C12["routes/budget_builder.py<br/>Budget builder routes"]
    end

    subgraph GroupD["Group D: Test Fixes (parallel with Group C)"]
        T1["test_db_improvements.py<br/>Patch target: app.DB_PATH to db.DB_PATH"]
        T2["test_networth_by_type.py<br/>Logger name: app.logger to routes.networth"]
    end

    subgraph GroupE["Group E: Final Cleanup"]
        C13["app.py<br/>Slim down to ~95-line shim"]
    end

    %% Group A has no dependencies
    C1 --> C2
    C1 --> C4
    C1 --> C5
    C1 --> C6
    C1 --> C7
    C1 --> C8
    C1 --> C9
    C1 --> C10
    C1 --> C11
    C1 --> C12
    C1 --> T1

    C2 --> C11
    C2 --> C12

    C9 --> T2

    %% All route modules must complete before final slim-down
    C4 --> C13
    C5 --> C13
    C6 --> C13
    C7 --> C13
    C8 --> C13
    C9 --> C13
    C10 --> C13
    C11 --> C13
    C12 --> C13
    T1 --> C13
    T2 --> C13
```

**Implementer parallelism guidance for Phase B:**

| Step | What | Parallel agents |
|------|------|-----------------|
| 1 | Create `db.py` + `routes/__init__.py` scaffold | 2 agents (or 1, both are small) |
| 2 | Create `ai.py` | 1 agent (blocked on `db.py`) |
| 3 | Create route modules C4-C10 + test fix T1 | Up to 8 parallel agents |
| 4 | Create route modules C11-C12 + test fix T2 | Up to 3 parallel agents (blocked on `ai.py` and `networth.py`) |
| 5 | Final `app.py` slim-down (C13) | 1 agent (blocked on all prior) |

**Gate rule:** Run `make test` after each group completes before proceeding to the next.

---

## 3. Phase 3: Investments Page — Preliminary Diagram

Source: `phase3-final-plan.md`. See final plan for authoritative file list and staff-review corrections.

```mermaid
graph TD
    subgraph Backend["Backend: New API Endpoints"]
        B1["routes/investments.py<br/>Account performance endpoint"]
        B2["routes/investments.py<br/>Holdings drill-down endpoint"]
        B3["routes/investments.py<br/>Contribution detection endpoint"]
        B4["routes/investments.py<br/>Asset allocation endpoint"]
    end

    subgraph Frontend["Frontend: New Page + Components"]
        F1["InvestmentsPage.jsx<br/>Page shell + routing"]
        F2["AccountDashboard.jsx<br/>Account cards + perf chart"]
        F3["HoldingsTable.jsx<br/>Sortable holdings drill-down"]
        F4["AllocationChart.jsx<br/>Asset allocation donut/pie"]
        F5["ContributionTracker.jsx<br/>Contribution history display"]
    end

    subgraph Sidebar["Navigation"]
        S1["Sidebar + Router<br/>Add Investments nav entry"]
    end

    %% Backend dependencies
    B1 --> F2
    B2 --> F3
    B3 --> F5
    B4 --> F4

    %% Frontend structure
    S1 --> F1
    F1 --> F2
    F1 --> F3
    F1 --> F4
    F1 --> F5

    %% Backend endpoints are independent of each other
```

**Estimated parallel opportunities:**
- All 4 backend endpoints can be built in parallel (independent data queries)
- Frontend page shell + sidebar entry first, then component work in parallel
- Each component can be built independently once its backend endpoint exists

---

## 4. Phase 4: Forecasting Page — Preliminary Diagram

Source: `phase4-final-plan.md`. See final plan for authoritative file list and staff-review corrections.

```mermaid
graph TD
    subgraph Backend["Backend: Projection + Planner Endpoints"]
        B1["routes/forecasting.py<br/>Simple projection endpoint"]
        B2["routes/forecasting.py<br/>Retirement gap analysis endpoint"]
        B3["Projection engine<br/>CAGR + contribution math"]
    end

    subgraph Frontend["Frontend: New Page + Components"]
        F1["ForecastingPage.jsx<br/>Page shell + routing"]
        F2["ProjectionChart.jsx<br/>Growth curves + sliders"]
        F3["RetirementPlanner.jsx<br/>Gap analysis + readiness"]
        F4["ContributionSliders.jsx<br/>Interactive adjustment controls"]
    end

    subgraph Sidebar["Navigation"]
        S1["Sidebar + Router<br/>Add Forecasting nav entry"]
    end

    %% Backend dependencies
    B3 --> B1
    B3 --> B2
    B1 --> F2
    B2 --> F3

    %% Frontend structure
    S1 --> F1
    F1 --> F2
    F1 --> F3
    F2 --> F4

    %% Phase 2.1 relationship
    P2_1["Phase 2.1 output<br/>Investable capital model"] --> B2
```

**Estimated parallel opportunities:**
- Projection engine is a shared dependency -- build first
- Both endpoints can be built in parallel once engine exists
- Sidebar + page shell first, then chart and planner components in parallel

---

## 5. Phase 5: Monte Carlo + AI Narrative — Preliminary Diagram

Source: `phase5-final-plan.md`. See final plan for authoritative file list and staff-review corrections.

```mermaid
graph TD
    subgraph Backend["Backend: Simulation + AI"]
        B1["Monte Carlo engine<br/>Simulation with historical volatility"]
        B2["routes/forecasting.py<br/>Monte Carlo API endpoint"]
        B3["routes/forecasting.py<br/>AI narrative endpoint"]
        B4["AI prompt template<br/>Projection interpretation prompt"]
    end

    subgraph Frontend["Frontend: Advanced Views"]
        F1["MonteCarloChart.jsx<br/>Probability band visualization"]
        F2["AINarrative.jsx<br/>AI commentary panel"]
        F3["ForecastingPage.jsx<br/>Add advanced toggle/tabs"]
    end

    %% Backend dependencies
    B1 --> B2
    B2 --> B3
    B4 --> B3

    %% Frontend dependencies
    B2 --> F1
    B3 --> F2
    F1 --> F3
    F2 --> F3
```

**Estimated parallel opportunities:**
- Monte Carlo engine and AI prompt template can be built in parallel
- Monte Carlo endpoint must exist before AI narrative endpoint (narrative interprets simulation results)
- Frontend components can be built in parallel once their endpoints exist
- Page integration (toggle/tabs) is last

---

## 6. Phase 6: Benchmark Comparison — Preliminary Diagram

Source: `phase6-final-plan.md`. See final plan for authoritative file list and staff-review corrections.

```mermaid
graph TD
    subgraph Backend["Backend: Benchmark Data"]
        B1["S&P 500 data source<br/>Historical benchmark prices"]
        B2["routes/investments.py<br/>Benchmark comparison endpoint"]
        B3["Target allocation storage<br/>User-defined asset targets"]
    end

    subgraph Frontend["Frontend: Comparison Views"]
        F1["BenchmarkChart.jsx<br/>Portfolio vs S&P 500 overlay"]
        F2["AllocationComparison.jsx<br/>Target vs actual allocation"]
        F3["InvestmentsPage.jsx<br/>Add benchmark tab/section"]
    end

    %% Backend dependencies
    B1 --> B2
    B3 --> F2
    B2 --> F1

    %% Frontend integration
    F1 --> F3
    F2 --> F3

    %% B1 and B3 are independent
```

**Estimated parallel opportunities:**
- S&P 500 data source and target allocation storage are independent
- Benchmark chart and allocation comparison are independent frontend components
- Page integration is last

---

## 7. Full Implementation Sequence Summary

```mermaid
graph LR
    subgraph Done["Completed"]
        P0["Phase 0"]
        P1["Phase 1"]
        P2["Phase 2"]
    end

    subgraph Next["Next Up (parallel)"]
        P2_1["Phase 2.1"]
        PB["Phase B"]
    end

    subgraph Wave1["Wave 1 (parallel, after Phase B)"]
        P3["Phase 3"]
        P4["Phase 4"]
    end

    subgraph Wave2["Wave 2 (parallel, after Wave 1)"]
        P5["Phase 5"]
        P6["Phase 6"]
    end

    P0 --> P1 --> P2
    P2 --> P2_1
    P2 --> PB
    PB --> P3
    PB --> P4
    P3 --> P6
    P4 --> P5
```

**Critical path:** Phase B --> Phase 4 --> Phase 5 (longest dependency chain for new features).

**Total waves:** 4 sequential waves with parallelism within each:
1. **Done:** Phases 0, 1, 2
2. **Next:** Phase 2.1 + Phase B (parallel)
3. **Wave 1:** Phase 3 + Phase 4 (parallel, after Phase B)
4. **Wave 2:** Phase 5 + Phase 6 (parallel, after their respective dependencies)
