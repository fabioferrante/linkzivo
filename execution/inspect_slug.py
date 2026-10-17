import os
import psycopg2

def main():
    conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/linkzivo_dev")
    cur = conn.cursor()
    cur.execute('SELECT id, slug, "destinationUrl", "workspaceId" FROM "SmartLink" WHERE LOWER(slug) = LOWER(%s)', ('ytb',))
    rows = cur.fetchall()
    print("Exact match 'ytb':", len(rows))
    for r in rows:
        print(r)

    cur.execute('SELECT id, slug, "destinationUrl" FROM "SmartLink" WHERE slug ILIKE %s', ('%ytb%',))
    rows_like = cur.fetchall()
    print("Like '%ytb%':", len(rows_like))
    for r in rows_like:
        print(r)

    cur.execute('SELECT count(*) FROM "SmartLink"')
    total = cur.fetchone()[0]
    print("Total SmartLinks no banco:", total)

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
