import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '安全警告 - MeowTV',
  description: '站点安全配置警告',
};

export default function WarningPage() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4'>
      <div className='max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-4 sm:p-8 border border-red-200'>
        {/* 警告图标 */}
        <div className='flex justify-center mb-4 sm:mb-6'>
          <div className='w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center'>
            <svg
              className='w-10 h-10 sm:w-12 sm:h-12 text-red-600'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
              />
            </svg>
          </div>
        </div>

        {/* 标题 */}
        <div className='text-center mb-6 sm:mb-8'>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 mb-2'>
            安全合规配置警告
          </h1>
          <div className='w-12 sm:w-16 h-1 bg-red-500 mx-auto rounded-full'></div>
        </div>

        {/* 警告内容 */}
        <div className='space-y-4 sm:space-y-6 text-gray-700'>
          <div className='bg-red-50 border-l-4 border-red-500 p-3 sm:p-4 rounded-r-lg'>
            <p className='text-base sm:text-lg font-semibold text-red-800 mb-2'>
              ⚠️ 安全风险提示
            </p>
            <p className='text-sm sm:text-base text-red-700'>
              检测到您的站点未配置访问控制，存在潜在的安全风险和法律合规问题。
            </p>
          </div>

          <div className='space-y-3 sm:space-y-4'>
            <h2 className='text-lg sm:text-xl font-semibold text-gray-900'>
              主要风险
            </h2>
            <ul className='space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-600'>
              <li className='flex items-start'>
                <span className='text-red-500 mr-2 mt-0.5'>•</span>
                <span>未经授权的访问可能导致内容被恶意传播</span>
              </li>
              <li className='flex items-start'>
                <span className='text-red-500 mr-2 mt-0.5'>•</span>
                <span>服务器资源可能被滥用，影响正常服务</span>
              </li>
              <li className='flex items-start'>
                <span className='text-red-500 mr-2 mt-0.5'>•</span>
                <span>可能收到相关权利方的法律通知</span>
              </li>
              <li className='flex items-start'>
                <span className='text-red-500 mr-2 mt-0.5'>•</span>
                <span>服务提供商可能因合规问题终止服务</span>
              </li>
            </ul>
          </div>

          <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4'>
            <h3 className='text-base sm:text-lg font-semibold text-yellow-800 mb-2'>
              🔒 安全配置建议
            </h3>
            <p className='text-sm sm:text-base text-yellow-700'>
              请立即配置{' '}
              <code className='bg-yellow-100 px-1.5 py-0.5 rounded text-xs sm:text-sm font-mono'>
                PASSWORD
              </code>{' '}
              环境变量以启用访问控制。
            </p>
          </div>
        </div>

        {/* 底部装饰 */}
        <div className='mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200'>
          <div className='text-center text-xs sm:text-sm text-gray-500'>
            <p>为确保系统安全性和合规性，请及时完成安全配置</p>
          </div>
        </div>
      </div>
    </div>
  );
}
