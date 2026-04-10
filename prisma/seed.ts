import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── 1. Default OWNER user ──────────────────────────────
  const passwordHash = await bcrypt.hash('admin123', 12)

  const owner = await prisma.appUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      userRole: UserRole.OWNER,
      fullName: 'Administrator',
      isActive: true,
    },
  })
  console.log('✅ Owner user:', owner.username)

  // ── 2. Default Wallets ─────────────────────────────────
  const wallets = [
    { name: 'Kas Utama' },
    { name: 'BCA Bisnis' },
    { name: 'BRI Bisnis' },
    { name: 'TikTok Shop Wallet' },
    { name: 'Shopee Wallet' },
  ]

  for (const w of wallets) {
    await prisma.wallet.upsert({
      where: { name: w.name },
      update: {},
      create: w,
    })
  }
  console.log('✅ Wallets seeded:', wallets.map(w => w.name).join(', '))

  // ── 3. Default Categories ──────────────────────────────
  const categories = [
    { categoryType: 'OTHER_INCOME' as const, name: 'Penjualan Marketplace' },
    { categoryType: 'OTHER_INCOME' as const, name: 'Refund Platform' },
    { categoryType: 'EXPENSE_BEBAN' as const, name: 'Pembelian Stok' },
    { categoryType: 'EXPENSE_BEBAN' as const, name: 'Biaya Operasional' },
    { categoryType: 'EXPENSE_BEBAN' as const, name: 'Gaji Karyawan' },
    { categoryType: 'EXPENSE_BEBAN' as const, name: 'Biaya Iklan' },
    { categoryType: 'EXPENSE_NON_BEBAN' as const, name: 'Investasi' },
    { categoryType: 'EXPENSE_NON_BEBAN' as const, name: 'Prive' },
  ]

  for (const c of categories) {
    await prisma.masterCategory.create({ data: c }).catch(() => {})
  }
  console.log('✅ Master categories seeded')

  // ── 4. Default Product Categories ─────────────────────
  const productCats = [
    { categoryName: 'Atasan' },
    { categoryName: 'Bawahan' },
    { categoryName: 'Outwear' },
    { categoryName: 'Aksesoris' },
    { categoryName: 'Set' },
  ]

  for (const pc of productCats) {
    await prisma.productCategory.create({ data: pc }).catch(() => {})
  }
  console.log('✅ Product categories seeded')

  console.log('\n🎉 Seeding complete!')
  console.log('   Login: admin / admin123')
  console.log('   ⚠️  Ganti password setelah login pertama!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
