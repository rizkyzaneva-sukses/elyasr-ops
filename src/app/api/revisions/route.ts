import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

export async function GET(req: Request) {
  try {
    const revs = await db.suggestRevision.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ data: revs })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title, description, imagesBase64 } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const rev = await db.suggestRevision.create({
      data: {
        title,
        description,
        imagesBase64: imagesBase64 || [],
        status: 'PENDING'
      }
    })

    return NextResponse.json({ data: rev })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const res = await db.suggestRevision.update({
      where: { id },
      data: { status }
    })
    
    return NextResponse.json({ data: res })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await db.suggestRevision.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
