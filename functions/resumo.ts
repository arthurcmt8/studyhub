import type { Request, Response } from 'express'

export default async (req: Request, res: Response) => {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ erro: 'sem token' })

  const r = await fetch(
    `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1/graphql`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ query: `query { materias { status } }` }),
    }
  )

  const { data } = await r.json()
  const lista = data?.materias || []

  res.json({
    total: lista.length,
    concluidas: lista.filter((m: any) => m.status === 'concluido').length,
    emAndamento: lista.filter((m: any) => m.status === 'em_andamento').length,
  })
}