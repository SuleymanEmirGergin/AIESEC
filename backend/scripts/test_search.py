import asyncio
import os
import sys

# Add current directory to path if needed (if running from root)
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.search_service import run_search_orchestration


async def test_search(place_type, lat, lon, radius=1000):
    print(
        f"\n--- Testing Search: {place_type} at ({lat}, {lon}) with radius {radius}m ---"
    )

    async with AsyncSessionLocal() as db:
        try:
            results, stage2_used = await run_search_orchestration(
                mode="auto",
                radius=radius,
                place_type=place_type,
                lat=lat,
                lon=lon,
                db=db,
            )

            print(f"Results Count: {len(results)}")
            print(f"Stage 2 Used: {stage2_used}")

            if len(results) > 0:
                print("\nSample Results:")
                for i, p in enumerate(results[:3]):
                    print(
                        f"[{i + 1}] ID: {p.id}, Name: {p.name}, Confidence: {p.confidence} ({p.confidence_level})"
                    )
            else:
                print("\nNO RESULTS FOUND.")

        except Exception as e:
            print(f"ERROR: {str(e)}")


async def main():
    import sys

    # Example locations in Istanbul
    locations = [
        ("Levent/Maslak (Office/Factory focus)", 41.10, 29.01),
        ("Kadıköy (School focus)", 40.99, 29.03),
    ]

    # Get type from argument or test all if none
    target_type = sys.argv[1] if len(sys.argv) > 1 else None
    types_to_test = [target_type] if target_type else ["factory", "school", "office"]

    for loc_name, lat, lon in locations:
        print(f"\n{'=' * 50}")
        print(f"LOCATION: {loc_name}")
        print(f"{'=' * 50}")

        for p_type in types_to_test:
            await test_search(p_type, lat, lon)


if __name__ == "__main__":
    asyncio.run(main())
